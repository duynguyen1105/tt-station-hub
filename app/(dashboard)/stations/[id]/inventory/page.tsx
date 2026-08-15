import { FuelImportForm, type TankOption } from '@/components/inventory/fuel-import-form'
import { ImportCancelButton } from '@/components/inventory/import-cancel-button'
import { MovementForm } from '@/components/inventory/movement-form'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUser } from '@/lib/auth/session'
import { formatDate, formatLiters } from '@/lib/format'
import { stationPumpsFromDispensers } from '@/lib/imports/pump-rows'
import { rosterForStation } from '@/lib/imports/station-rosters'
import { type BaremLookup, lookupBaremLiters } from '@/lib/inventory/barem'
import { fetchBaremSheet } from '@/lib/inventory/barem-fetch'
import { baremSheetFor } from '@/lib/inventory/barem-sheets'
import { isLowStock } from '@/lib/inventory/stock-calculator'
import { computeTankFlows } from '@/lib/inventory/tank-ledger'
import { shiftDateFor } from '@/lib/photos/ingest'
import { prisma } from '@/lib/prisma'
import { getSignedUrl } from '@/lib/storage/photo-storage'
import { fuelTypeLabel } from '@/lib/ui/status'
import { vi } from '@/messages/vi'

// Hoisted so the react-compiler purity lint doesn't see Date.now() inside the
// component body — a server component renders once per request, so "today" is
// stable for the render.
function todayShiftDate(): Date {
  return shiftDateFor(Date.now())
}

/** Tank choices for the import form: every tank a dispenser draws from, plus
 * tanks only seen via dip records (reserve tanks carry no dispenser). */
function buildTankOptions(
  dispensers: { tankCode: string | null; fuelType: string; tankCapacityK: number | null }[],
  dipTanks: { tankCode: string; fuelType: string | null }[]
): TankOption[] {
  const options = new Map<string, TankOption>()
  for (const d of dispensers) {
    if (!d.tankCode || options.has(d.tankCode)) continue
    const cap = d.tankCapacityK ? ` (${d.tankCapacityK}K)` : ''
    options.set(d.tankCode, {
      code: d.tankCode,
      label: `${d.tankCode.replace('HAM_', 'Hầm ')} — ${fuelTypeLabel(d.fuelType)}${cap}`,
      fuelType: d.fuelType,
      capacityK: d.tankCapacityK,
    })
  }
  for (const t of dipTanks) {
    if (options.has(t.tankCode)) continue
    options.set(t.tankCode, {
      code: t.tankCode,
      label: `${t.tankCode.replace('HAM_', 'Hầm ')}${t.fuelType ? ` — ${fuelTypeLabel(t.fuelType)}` : ''}`,
      fuelType: t.fuelType,
      // A Hầm seen only through its dips: nothing says how big it is.
      capacityK: null,
    })
  }
  return [...options.values()].sort((a, b) => a.code.localeCompare(b.code))
}

export default async function StationInventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const user = await requireUser()
  const { id } = await params
  const today = todayShiftDate()

  // Optional date filter for the import history (?from=YYYY-MM-DD&to=...).
  // Bounds are Vietnam wall-clock days; a filtered list may go deeper than the
  // default "latest 20".
  const { from, to } = await searchParams
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
  const fromDate = from && DATE_RE.test(from) ? new Date(`${from}T00:00:00+07:00`) : null
  const toDate = to && DATE_RE.test(to) ? new Date(`${to}T23:59:59+07:00`) : null
  const importFilter = {
    ...(fromDate ? { gte: fromDate } : {}),
    ...(toDate ? { lte: toDate } : {}),
  }
  const hasDateFilter = fromDate !== null || toDate !== null
  const [station, balances, dips, dispensers, imports] = await Promise.all([
    prisma.station.findUnique({ where: { id }, select: { code: true } }),
    prisma.inventoryBalance.findMany({
      where: { stationId: id },
      orderBy: { fuelType: 'asc' },
    }),
    prisma.tankDipRecord.findMany({
      where: { stationId: id },
      orderBy: { measuredAt: 'desc' },
      take: 40,
    }),
    prisma.dispenser.findMany({ where: { stationId: id, isActive: true } }),
    prisma.fuelImport.findMany({
      where: {
        stationId: id,
        ...(hasDateFilter ? { importedAt: importFilter } : {}),
      },
      orderBy: { importedAt: 'desc' },
      take: hasDateFilter ? 200 : 20,
    }),
  ])

  // Today's per-tank flows: imports from slips, sales from today's shift readings.
  const todayShift = await prisma.shift.findFirst({
    where: { stationId: id, shiftDate: today },
    select: { id: true },
  })
  const todayReadings = todayShift
    ? await prisma.shiftReading.findMany({ where: { shiftId: todayShift.id } })
    : []
  const flows = computeTankFlows({
    dispensers: dispensers.map((d) => ({ id: d.id, tankCode: d.tankCode })),
    readings: todayReadings.map((r) => ({
      dispenserId: r.dispenserId,
      openingElectronicReading:
        r.openingElectronicReading === null ? null : Number(r.openingElectronicReading),
      electronicReading: r.electronicReading === null ? null : Number(r.electronicReading),
    })),
    // The list above may be date-filtered to the past; "Nhập hôm nay" must not be.
    imports: (hasDateFilter
      ? await prisma.fuelImport.findMany({
          where: { stationId: id, canceledAt: null, importedAt: { gte: today } },
        })
      : imports.filter((i) => !i.canceledAt && i.importedAt >= today)
    ).map((i) => ({ tankCode: i.tankCode, litersActual: Number(i.litersActual) })),
  })

  // Latest measurement per tank (dips are ordered newest-first).
  const latestByTank = new Map<string, (typeof dips)[number]>()
  for (const dip of dips) {
    if (!latestByTank.has(dip.tankCode)) latestByTank.set(dip.tankCode, dip)
  }
  // Tanks with activity today but no dip yet still deserve a row.
  const tankCodes = [...new Set([...latestByTank.keys(), ...flows.keys()])].sort()

  const tanks = buildTankOptions(
    dispensers,
    [...latestByTank.values()].map((d) => ({ tankCode: d.tankCode, fuelType: d.fuelType }))
  )

  // Signed links for each import's documents so the reviewer can open the
  // originals straight from the list: docs attached to the import itself plus
  // docs attached to its parent biên bản (receipt) — the biên bản pages (BB)
  // and the "tài liệu nhập hàng" (TL) uploaded in the wizard's last step.
  const receiptIds = [...new Set(imports.map((i) => i.receiptId).filter((r): r is string => !!r))]
  const docs = await prisma.fuelImportDocument.findMany({
    where: {
      OR: [{ importId: { in: imports.map((i) => i.id) } }, { receiptId: { in: receiptIds } }],
    },
    orderBy: { createdAt: 'asc' },
  })
  const docLinks = new Map<string, { url: string; name: string }[]>()
  const receiptLinks = new Map<string, { url: string; name: string }[]>()
  for (const doc of docs) {
    const url = await getSignedUrl(doc.storagePath).catch(() => null)
    if (!url) continue
    if (doc.importId) {
      const list = docLinks.get(doc.importId) ?? []
      list.push({ url, name: doc.fileName ?? `CT${list.length + 1}` })
      docLinks.set(doc.importId, list)
    } else if (doc.receiptId) {
      const list = receiptLinks.get(doc.receiptId) ?? []
      const prefix = doc.kind === 'bien_ban' ? 'BB' : doc.kind === 'phieu_xuat_kho' ? 'PXK' : 'TL'
      list.push({
        url,
        name: `${prefix}${list.filter((l) => l.name.startsWith(prefix)).length + 1}`,
      })
      receiptLinks.set(doc.receiptId, list)
    }
  }
  const linksForImport = (row: (typeof imports)[number]) => [
    ...(docLinks.get(row.id) ?? []),
    ...(row.receiptId ? (receiptLinks.get(row.receiptId) ?? []) : []),
  ]

  // "Người nhập" for each slip — Excel always had it, the web list now too.
  const creatorIds = [...new Set(imports.map((i) => i.createdBy).filter((c): c is string => !!c))]
  const creators =
    creatorIds.length > 0
      ? await prisma.profile.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, fullName: true },
        })
      : []
  const creatorById = new Map(creators.map((c) => [c.id, c.fullName]))

  // ACTUAL stock: each tank's latest dip height resolved against the live
  // Barem (same sheet, same no-cache rule as the nhập-hàng form). A tank whose
  // height the Barem cannot answer keeps its raw reading and shows the reason.
  const binding = baremSheetFor(station?.code)
  const baremRead = binding ? await fetchBaremSheet(binding) : null
  const baremByTank = baremRead?.ok
    ? new Map(baremRead.sheet.tanks.map((t) => [t.tankCode, t]))
    : null
  const actualForTank = (tankCode: string): BaremLookup | null => {
    const dip = latestByTank.get(tankCode)
    if (!dip || !baremByTank) return null
    return lookupBaremLiters(baremByTank.get(tankCode), Math.round(Number(dip.dipValue)))
  }
  const refusalLabel: Record<string, string> = {
    'below-minimum': vi.imports.baremOutOfRange,
    'above-maximum': vi.imports.baremOutOfRange,
    'missing-point': vi.imports.baremMissingPoint,
    'unknown-tank': vi.imports.baremUnknownTank,
  }

  // Per-fuel comparison: theoretical (movements) vs actual (dips). A fuel whose
  // tanks are not all measured-and-resolved cannot honestly be compared.
  const actualByFuel = new Map<string, number>()
  const incompleteFuels = new Set<string>()
  for (const t of tanks) {
    const fuel = latestByTank.get(t.code)?.fuelType ?? t.fuelType
    if (!fuel) continue
    const lookup = actualForTank(t.code)
    if (lookup?.ok) actualByFuel.set(fuel, (actualByFuel.get(fuel) ?? 0) + lookup.liters)
    else incompleteFuels.add(fuel)
  }
  const compareFuels = [
    ...new Set([...balances.map((b) => b.fuelType), ...actualByFuel.keys()]),
  ].sort()

  // The Hầm and Trụ this Trạm's own pre-printed biên bản lists — resolved here
  // rather than in the form, so the 13 rosters stay out of the browser bundle.
  const paperRoster = station ? rosterForStation(station.code) : undefined
  // Section (d)'s rows, and the Hầm each Trụ draws from — what says which (c)
  // row a moving Trụ contaminates.
  const stationPumps = stationPumpsFromDispensers(dispensers)

  const canEdit = user.role !== 'viewer'
  const fuelForTank = new Map(tanks.map((t) => [t.code, t.fuelType]))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-muted-foreground text-sm font-medium">{vi.inventory.title}</h2>
        <div className="flex gap-2">
          {canEdit && (
            <FuelImportForm
              stationId={id}
              tanks={tanks}
              paperTanks={paperRoster?.tanks ?? []}
              stationPumps={stationPumps}
              paperPumps={paperRoster?.pumps ?? []}
            />
          )}
          <MovementForm stationId={id} />
        </div>
      </div>
      <section className="space-y-1">
        <h3 className="text-sm font-semibold">{vi.inventory.theoreticalTitle}</h3>
        <p className="text-muted-foreground text-xs">{vi.inventory.theoreticalNote}</p>
      </section>
      {balances.length === 0 ? (
        <p className="text-muted-foreground text-sm">{vi.inventory.empty}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {balances.map((balance) => {
            const estimated = Number(balance.estimatedStock)
            const threshold = balance.lowThreshold !== null ? Number(balance.lowThreshold) : null
            const low = isLowStock(estimated, threshold)
            return (
              <Card key={balance.id}>
                <CardHeader className="flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base">{fuelTypeLabel(balance.fuelType)}</CardTitle>
                  {low && <StatusBadge label={vi.inventory.low} tone="danger" />}
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{vi.inventory.estimated}</span>
                    <span className="font-mono">{formatLiters(estimated)}</span>
                  </div>
                  {balance.lastPhysicalStock !== null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{vi.inventory.physical}</span>
                      <span className="font-mono">
                        {formatLiters(Number(balance.lastPhysicalStock))}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{vi.inventory.actualTitle}</h3>
        {baremRead && !baremRead.ok && (
          <p className="text-destructive text-xs">{vi.inventory.baremSheetFailed}</p>
        )}
        {tankCodes.length === 0 ? (
          <p className="text-muted-foreground text-sm">{vi.inventory.noDips}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="p-2">{vi.inventory.tank}</th>
                <th className="p-2">{vi.inventory.fuelType}</th>
                <th className="p-2 text-right">{vi.inventory.dipValue}</th>
                <th className="p-2 text-right">{vi.inventory.actualLiters}</th>
                <th className="p-2 text-right">{vi.inventory.dipDelta}</th>
                <th className="p-2 text-right">{vi.inventory.importedToday}</th>
                <th className="p-2 text-right">{vi.inventory.soldToday}</th>
                <th className="p-2">{vi.inventory.measuredAt}</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {tankCodes.map((tankCode) => {
                const dip = latestByTank.get(tankCode)
                const flow = flows.get(tankCode)
                const lookup = actualForTank(tankCode)
                return (
                  <tr key={tankCode} className="border-b">
                    <td className="p-2 font-medium">{tankCode.replace('HAM_', 'Hầm ')}</td>
                    <td className="p-2">
                      {dip?.fuelType
                        ? fuelTypeLabel(dip.fuelType)
                        : fuelForTank.get(tankCode)
                          ? fuelTypeLabel(fuelForTank.get(tankCode)!)
                          : '—'}
                    </td>
                    <td className="p-2 text-right font-mono">{dip?.dipValue.toString() ?? '—'}</td>
                    <td className="p-2 text-right font-mono">
                      {lookup?.ok ? (
                        <span className="font-semibold">{formatLiters(lookup.liters)}</span>
                      ) : lookup ? (
                        <span className="text-muted-foreground text-xs">
                          {refusalLabel[lookup.reason]}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {dip?.deltaFromPrevious?.toString() ?? '—'}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {flow?.imported ? formatLiters(flow.imported) : '—'}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {flow?.sold ? formatLiters(flow.sold) : '—'}
                    </td>
                    <td className="p-2">{dip ? formatDate(dip.measuredAt) : '—'}</td>
                    <td className="space-x-1 p-2">
                      {dip?.isReserve && <StatusBadge label={vi.inventory.reserve} tone="muted" />}
                      {dip?.isAnomaly && (
                        <StatusBadge label={vi.inventory.reserveChanged} tone="danger" />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {compareFuels.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{vi.inventory.compareTitle}</h3>
          <table className="w-full max-w-xl text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="p-2">{vi.inventory.fuelType}</th>
                <th className="p-2 text-right">{vi.inventory.theoretical}</th>
                <th className="p-2 text-right">{vi.inventory.actual}</th>
                <th className="p-2 text-right">{vi.inventory.variance}</th>
              </tr>
            </thead>
            <tbody>
              {compareFuels.map((fuel) => {
                const balance = balances.find((b) => b.fuelType === fuel)
                const theoretical = balance ? Number(balance.estimatedStock) : 0
                const actual = actualByFuel.get(fuel)
                // Every tank of the fuel must be measured AND resolved by the
                // Barem before the comparison means anything.
                const comparable = actual !== undefined && !incompleteFuels.has(fuel)
                const diff = comparable ? theoretical - actual : null
                return (
                  <tr key={fuel} className="border-b">
                    <td className="p-2 font-medium">{fuelTypeLabel(fuel)}</td>
                    <td className="p-2 text-right font-mono">{formatLiters(theoretical)}</td>
                    <td className="p-2 text-right font-mono">
                      {actual === undefined ? '—' : formatLiters(actual)}
                    </td>
                    <td className="p-2 text-right">
                      {diff === null ? (
                        <span className="text-muted-foreground text-xs">
                          {vi.inventory.diffIncomplete}
                        </span>
                      ) : (
                        <span
                          className={`font-mono ${diff !== 0 ? 'font-semibold' : 'text-muted-foreground'}`}
                        >
                          {formatLiters(diff)}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-muted-foreground text-sm font-medium">{vi.imports.recent}</h3>
          <div className="flex flex-wrap items-center gap-2">
            {/* Plain GET form: the filter lives in the URL, so it survives
                refresh and can be shared — no client JS involved. */}
            <form method="get" className="flex flex-wrap items-center gap-2 text-sm">
              <label className="text-muted-foreground flex items-center gap-1">
                {vi.imports.fromDate}
                <input
                  type="date"
                  name="from"
                  defaultValue={from && fromDate ? from : undefined}
                  className="border-input bg-background h-8 rounded-md border px-2"
                />
              </label>
              <label className="text-muted-foreground flex items-center gap-1">
                {vi.imports.toDate}
                <input
                  type="date"
                  name="to"
                  defaultValue={to && toDate ? to : undefined}
                  className="border-input bg-background h-8 rounded-md border px-2"
                />
              </label>
              <Button type="submit" size="sm" variant="outline">
                {vi.imports.filter}
              </Button>
            </form>
            <Button asChild size="sm" variant="outline">
              <a
                href={`/api/imports/export?stationId=${id}${
                  from && fromDate ? `&from=${from}` : ''
                }${to && toDate ? `&to=${to}` : ''}`}
              >
                {vi.imports.exportExcel}
              </a>
            </Button>
          </div>
        </div>
        {imports.length === 0 ? (
          <p className="text-muted-foreground text-sm">{vi.imports.none}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="p-2">{vi.imports.importedAt}</th>
                <th className="p-2">{vi.inventory.tank}</th>
                <th className="p-2">{vi.inventory.fuelType}</th>
                <th className="p-2 text-right">{vi.imports.liters}</th>
                <th className="p-2 text-right">{vi.imports.temperature}</th>
                <th className="p-2">{vi.imports.invoiceNo}</th>
                <th className="p-2">{vi.imports.creator}</th>
                <th className="p-2">{vi.imports.documents}</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {imports.map((row) => (
                <tr key={row.id} className={`border-b ${row.canceledAt ? 'opacity-50' : ''}`}>
                  <td className="p-2">
                    {row.receiptId ? (
                      // A wizard slip opens its saved biên bản for cross-checking.
                      <a
                        href={`/stations/${id}/imports/${row.receiptId}`}
                        className="text-primary underline underline-offset-2"
                      >
                        {formatDate(row.importedAt)}
                      </a>
                    ) : (
                      formatDate(row.importedAt)
                    )}
                  </td>
                  <td className="p-2">{row.tankCode.replace('HAM_', 'Hầm ')}</td>
                  <td className="p-2">{fuelTypeLabel(row.fuelType)}</td>
                  <td className="p-2 text-right font-mono">
                    {formatLiters(Number(row.litersActual))}
                  </td>
                  <td className="p-2 text-right font-mono">
                    {row.temperatureC === null ? '—' : `${row.temperatureC}°C`}
                  </td>
                  <td className="p-2">{row.invoiceNo ?? '—'}</td>
                  <td className="p-2">
                    {(row.createdBy && creatorById.get(row.createdBy)) ?? '—'}
                  </td>
                  <td className="space-x-2 p-2">
                    {linksForImport(row).map((doc, index) => (
                      <a
                        key={index}
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline underline-offset-2"
                      >
                        {doc.name}
                      </a>
                    ))}
                  </td>
                  <td className="p-2 text-right">
                    {row.canceledAt ? (
                      <StatusBadge label={vi.imports.canceled} tone="muted" />
                    ) : canEdit ? (
                      <ImportCancelButton importId={row.id} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
