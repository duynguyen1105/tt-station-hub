import { FuelImportForm, type TankOption } from '@/components/inventory/fuel-import-form'
import { ImportCancelButton } from '@/components/inventory/import-cancel-button'
import { MovementForm } from '@/components/inventory/movement-form'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUser } from '@/lib/auth/session'
import { formatDate, formatLiters } from '@/lib/format'
import { rosterForStation } from '@/lib/imports/station-rosters'
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
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireUser()
  const { id } = await params
  const today = todayShiftDate()
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
      where: { stationId: id },
      orderBy: { importedAt: 'desc' },
      take: 20,
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
    imports: imports
      .filter((i) => !i.canceledAt && i.importedAt >= today)
      .map((i) => ({ tankCode: i.tankCode, litersActual: Number(i.litersActual) })),
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
  // and the related session photos (HA) uploaded in the wizard's last step.
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
      const prefix = doc.kind === 'bien_ban' ? 'BB' : 'HA'
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

  // The Hầm this Trạm's own pre-printed biên bản lists — resolved here rather
  // than in the form, so the 13 rosters stay out of the browser bundle.
  const paperTanks = station ? (rosterForStation(station.code)?.tanks ?? []) : []

  const canEdit = user.role !== 'viewer'
  const fuelForTank = new Map(tanks.map((t) => [t.code, t.fuelType]))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-muted-foreground text-sm font-medium">{vi.inventory.title}</h2>
        <div className="flex gap-2">
          {canEdit && <FuelImportForm stationId={id} tanks={tanks} paperTanks={paperTanks} />}
          <MovementForm stationId={id} />
        </div>
      </div>
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
        <h3 className="text-muted-foreground text-sm font-medium">{vi.inventory.tankDips}</h3>
        {tankCodes.length === 0 ? (
          <p className="text-muted-foreground text-sm">{vi.inventory.noDips}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="p-2">{vi.inventory.tank}</th>
                <th className="p-2">{vi.inventory.fuelType}</th>
                <th className="p-2 text-right">{vi.inventory.dipValue}</th>
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

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-muted-foreground text-sm font-medium">{vi.imports.recent}</h3>
          <Button asChild size="sm" variant="outline">
            <a href={`/api/imports/export?stationId=${id}`}>{vi.imports.exportExcel}</a>
          </Button>
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
                <th className="p-2">{vi.imports.documents}</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {imports.map((row) => (
                <tr key={row.id} className={`border-b ${row.canceledAt ? 'opacity-50' : ''}`}>
                  <td className="p-2">{formatDate(row.importedAt)}</td>
                  <td className="p-2">{row.tankCode.replace('HAM_', 'Hầm ')}</td>
                  <td className="p-2">{fuelTypeLabel(row.fuelType)}</td>
                  <td className="p-2 text-right font-mono">
                    {formatLiters(Number(row.litersActual))}
                  </td>
                  <td className="p-2 text-right font-mono">
                    {row.temperatureC === null ? '—' : `${row.temperatureC}°C`}
                  </td>
                  <td className="p-2">{row.invoiceNo ?? '—'}</td>
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
