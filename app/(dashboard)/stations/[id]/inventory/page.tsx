import Link from 'next/link'

import { FuelImportForm, type TankOption } from '@/components/inventory/fuel-import-form'
import { ImportCancelButton } from '@/components/inventory/import-cancel-button'
import { ImportFilterForm } from '@/components/inventory/import-filter-form'
import { MovementForm } from '@/components/inventory/movement-form'
import { OpeningBalanceForm, type OpeningEntry } from '@/components/inventory/opening-balance-form'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { requireStationAccess } from '@/lib/auth/station-guard'
import { formatDate, formatDateTime, formatLiters } from '@/lib/format'
import { fuelTypeLabeller, loadStationFuels } from '@/lib/fuels/load-catalogue'
import { stationPumpsFromDispensers } from '@/lib/imports/pump-rows'
import { rosterForStation } from '@/lib/imports/station-rosters'
import { type BaremLookup, lookupBaremLiters } from '@/lib/inventory/barem'
import { fetchBaremSheet } from '@/lib/inventory/barem-fetch'
import { baremSheetFor } from '@/lib/inventory/barem-sheets'
import { type BookMovement, bookSummary, dailyLedger } from '@/lib/inventory/book-stock'
import { isLowStock } from '@/lib/inventory/stock-calculator'
import { computeTankFlows } from '@/lib/inventory/tank-ledger'
import { shiftDateFor } from '@/lib/photos/ingest'
import { prisma } from '@/lib/prisma'
import { signedUrlsForPaths } from '@/lib/storage/photo-storage'
import { vi } from '@/messages/vi'

// Hoisted so the react-compiler purity lint doesn't see Date.now() inside the
// component body — a server component renders once per request, so "today" is
// stable for the render.
function todayShiftDate(): Date {
  return shiftDateFor(Date.now())
}

/** Tank choices for the import form: every tank a dispenser draws from, plus
 * tanks only seen via dip records (reserve tanks carry no dispenser). Each label names
 * the hầm's nhiên liệu, so the page hands in the danh mục's answer for a khóa. */
function buildTankOptions(
  dispensers: { tankCode: string | null; fuelType: string; tankCapacityK: number | null }[],
  dipTanks: { tankCode: string; fuelType: string | null }[],
  fuelLabel: (fuelType: string) => string
): TankOption[] {
  const options = new Map<string, TankOption>()
  for (const d of dispensers) {
    if (!d.tankCode || options.has(d.tankCode)) continue
    const cap = d.tankCapacityK ? ` (${d.tankCapacityK}K)` : ''
    options.set(d.tankCode, {
      code: d.tankCode,
      label: `${d.tankCode.replace('HAM_', 'Hầm ')} — ${fuelLabel(d.fuelType)}${cap}`,
      fuelType: d.fuelType,
      capacityK: d.tankCapacityK,
    })
  }
  for (const t of dipTanks) {
    if (options.has(t.tankCode)) continue
    options.set(t.tankCode, {
      code: t.tankCode,
      label: `${t.tankCode.replace('HAM_', 'Hầm ')}${t.fuelType ? ` — ${fuelLabel(t.fuelType)}` : ''}`,
      fuelType: t.fuelType,
      // A Hầm seen only through its dips: nothing says how big it is.
      capacityK: null,
    })
  }
  return [...options.values()].sort((a, b) => a.code.localeCompare(b.code))
}

const TABS = ['tong-quan', 'so-sach', 'do-bon', 'nhap-hang'] as const
type InventoryTab = (typeof TABS)[number]
const PAGE_SIZE = 20

export default async function StationInventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string; to?: string; tab?: string; page?: string }>
}) {
  const { id } = await params
  const user = await requireStationAccess(id)
  const today = todayShiftDate()
  // Every tên nhiên liệu on this page — tồn kho, sổ sách, đo hầm, phiếu nhập — is the
  // danh mục's, read once for the request.
  const fuelLabel = await fuelTypeLabeller()
  // What this trạm sells, for the two forms on this page. Every table below resolves
  // whatever khóa its rows already carry; only the ô chọn narrow.
  const stationFuels = await loadStationFuels(id)

  // The histories grow every day, so each lives in its own sub-tab with
  // pagination; the overview stays a fixed-size dashboard. Tab, page and the
  // import-history date filter all live in the URL (plain GET navigation).
  const { from, to, tab: rawTab, page: rawPage } = await searchParams
  const tab: InventoryTab = (TABS as readonly string[]).includes(rawTab ?? '')
    ? (rawTab as InventoryTab)
    : 'tong-quan'
  const pageNum = Math.max(1, Number.parseInt(rawPage ?? '1', 10) || 1)
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
  const fromDate = from && DATE_RE.test(from) ? new Date(`${from}T00:00:00+07:00`) : null
  const toDate = to && DATE_RE.test(to) ? new Date(`${to}T23:59:59+07:00`) : null
  const importFilter = {
    ...(fromDate ? { gte: fromDate } : {}),
    ...(toDate ? { lte: toDate } : {}),
  }
  const hasDateFilter = fromDate !== null || toDate !== null
  const importsWhere = {
    stationId: id,
    ...(hasDateFilter ? { importedAt: importFilter } : {}),
  }
  // Which of the heavy sources this tab actually renders. The Barem is a LIVE
  // Google Sheet fetch (~1s, uncached by ADR 0005) — only the tabs that show
  // litres pay for it, and it runs concurrently with the DB batch below.
  const needsBarem = tab === 'tong-quan' || tab === 'do-bon'
  const needsBook = tab === 'tong-quan' || tab === 'so-sach'
  const station = await prisma.station.findUnique({ where: { id }, select: { code: true } })
  const binding = baremSheetFor(station?.code)
  const baremPromise = needsBarem && binding ? fetchBaremSheet(binding) : null
  const [balances, dips, dispensers, imports, openings, movements, importsTotal] =
    await Promise.all([
      prisma.inventoryBalance.findMany({
        where: { stationId: id },
        orderBy: { fuelType: 'asc' },
      }),
      // Latest-per-tank for the overview; the do-bon tab paginates separately.
      prisma.tankDipRecord.findMany({
        where: { stationId: id },
        orderBy: { measuredAt: 'desc' },
        take: 120,
      }),
      prisma.dispenser.findMany({ where: { stationId: id, isActive: true } }),
      prisma.fuelImport.findMany({
        where: importsWhere,
        orderBy: { importedAt: 'desc' },
        skip: tab === 'nhap-hang' ? (pageNum - 1) * PAGE_SIZE : 0,
        take: PAGE_SIZE,
      }),
      prisma.inventoryOpeningBalance.findMany({ where: { stationId: id } }),
      // The whole movement history feeds the book ledger — skipped on the
      // tabs that render neither the summary nor the daily ledger.
      needsBook
        ? prisma.inventoryMovement.findMany({
            where: { stationId: id },
            orderBy: { movementDate: 'asc' },
          })
        : ([] as {
            movementType: string
            quantity: unknown
            movementDate: Date
            fuelType: string
          }[]),
      tab === 'nhap-hang' ? prisma.fuelImport.count({ where: importsWhere }) : 0,
    ])

  // Dip history page — only fetched on its own tab.
  const [dipsPage, dipsTotal] =
    tab === 'do-bon'
      ? await Promise.all([
          prisma.tankDipRecord.findMany({
            where: { stationId: id },
            orderBy: { measuredAt: 'desc' },
            skip: (pageNum - 1) * PAGE_SIZE,
            take: PAGE_SIZE,
          }),
          prisma.tankDipRecord.count({ where: { stationId: id } }),
        ])
      : [[], 0]

  // Today's per-tank flows: imports from slips, sales from today's shift readings.
  const todayShift = await prisma.shift.findFirst({
    where: { stationId: id, shiftDate: today },
    select: { id: true },
  })
  const todayReadings = todayShift
    ? await prisma.shiftReading.findMany({ where: { shiftId: todayShift.id } })
    : []
  // Fetched on its own so neither the date filter nor pagination can starve it.
  const todayImports = await prisma.fuelImport.findMany({
    where: { stationId: id, canceledAt: null, importedAt: { gte: today } },
  })
  const flows = computeTankFlows({
    dispensers: dispensers.map((d) => ({ id: d.id, tankCode: d.tankCode })),
    readings: todayReadings.map((r) => ({
      dispenserId: r.dispenserId,
      openingElectronicReading:
        r.openingElectronicReading === null ? null : Number(r.openingElectronicReading),
      electronicReading: r.electronicReading === null ? null : Number(r.electronicReading),
    })),
    imports: todayImports.map((i) => ({
      tankCode: i.tankCode,
      litersActual: Number(i.litersActual),
    })),
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
    [...latestByTank.values()].map((d) => ({ tankCode: d.tankCode, fuelType: d.fuelType })),
    fuelLabel
  )

  // Signed links for each import's documents so the reviewer can open the
  // originals straight from the list: docs attached to the import itself plus
  // docs attached to its parent biên bản (receipt) — the biên bản pages (BB)
  // and the "tài liệu nhập hàng" (TL) uploaded in the wizard's last step.
  const receiptIds = [...new Set(imports.map((i) => i.receiptId).filter((r): r is string => !!r))]
  const docs =
    tab === 'nhap-hang'
      ? await prisma.fuelImportDocument.findMany({
          where: {
            OR: [{ importId: { in: imports.map((i) => i.id) } }, { receiptId: { in: receiptIds } }],
          },
          orderBy: { createdAt: 'asc' },
        })
      : []
  // One bulk signing call for the whole table (was one round-trip per doc).
  const docUrlByPath = await signedUrlsForPaths(docs.map((d) => d.storagePath))
  const docLinks = new Map<string, { url: string; name: string }[]>()
  const receiptLinks = new Map<string, { url: string; name: string }[]>()
  for (const doc of docs) {
    const url = docUrlByPath.get(doc.storagePath)
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
  const baremRead = baremPromise ? await baremPromise : null
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
    ...new Set([
      ...balances.map((b) => b.fuelType),
      ...dispensers.map((d) => d.fuelType),
      ...actualByFuel.keys(),
    ]),
  ].sort()

  // BOOK stock, anchored on Trường Thịnh's opening balance (số đầu kỳ):
  // đầu kỳ + nhập − xuất ± điều chỉnh over the movements since the anchor date.
  // A fuel with no anchor yet counts from zero across all movements and says so.
  const openingByFuel = new Map(openings.map((o) => [o.fuelType, o]))
  const movementsByFuel = new Map<string, BookMovement[]>()
  for (const m of movements) {
    const list = movementsByFuel.get(m.fuelType) ?? []
    list.push({
      movementType: m.movementType,
      quantity: Number(m.quantity),
      movementDate: m.movementDate,
    })
    movementsByFuel.set(m.fuelType, list)
  }
  const EPOCH = new Date(0)
  const bookFuels = [
    ...new Set([
      ...openings.map((o) => o.fuelType),
      ...balances.map((b) => b.fuelType),
      ...dispensers.map((d) => d.fuelType),
    ]),
  ].sort()
  const bookByFuel = new Map(
    bookFuels.map((fuel) => {
      const opening = openingByFuel.get(fuel)
      return [
        fuel,
        {
          opening,
          summary: bookSummary(
            opening ? Number(opening.openingLiters) : 0,
            opening?.effectiveDate ?? EPOCH,
            movementsByFuel.get(fuel) ?? []
          ),
        },
      ] as const
    })
  )
  // Day-by-day ledger across fuels, newest first, capped for display.
  const ledgerRows = bookFuels
    .flatMap((fuel) => {
      const opening = openingByFuel.get(fuel)
      return dailyLedger(
        opening ? Number(opening.openingLiters) : 0,
        opening?.effectiveDate ?? EPOCH,
        movementsByFuel.get(fuel) ?? []
      ).map((row) => ({ fuel, ...row }))
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.fuel.localeCompare(b.fuel))
  const ledgerTotal = ledgerRows.length
  const ledgerPage = ledgerRows.slice((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE)
  const openingEntries: OpeningEntry[] = bookFuels.map((fuel) => {
    const opening = openingByFuel.get(fuel)
    return {
      fuelType: fuel,
      fuelLabel: fuelLabel(fuel),
      openingLiters: opening ? Number(opening.openingLiters) : null,
      effectiveDate: opening ? opening.effectiveDate.toISOString().slice(0, 10) : null,
    }
  })

  // Signed photo links for the dip history — the measurement's own evidence.
  // Only the visible page's photos are signed.
  const dipPhotoIds = dipsPage.map((d) => d.photoId).filter((p): p is string => !!p)
  const dipPhotos = dipPhotoIds.length
    ? await prisma.shiftPhoto.findMany({
        where: { id: { in: dipPhotoIds } },
        select: { id: true, storagePath: true },
      })
    : []
  const dipPhotoPathUrl = await signedUrlsForPaths(dipPhotos.map((p) => p.storagePath))
  const dipPhotoUrl = new Map(
    dipPhotos.flatMap((p) => {
      const url = p.storagePath ? dipPhotoPathUrl.get(p.storagePath) : undefined
      return url ? [[p.id, url] as const] : []
    })
  )

  // The Hầm and Trụ this Trạm's own pre-printed biên bản lists — resolved here
  // rather than in the form, so the 13 rosters stay out of the browser bundle.
  const paperRoster = station ? rosterForStation(station.code) : undefined
  // Section (d)'s rows, and the Hầm each Trụ draws from — what says which (c)
  // row a moving Trụ contaminates.
  const stationPumps = stationPumpsFromDispensers(dispensers)

  const canEdit = user.role !== 'viewer'
  const fuelForTank = new Map(tanks.map((t) => [t.code, t.fuelType]))

  const base = `/stations/${id}/inventory`
  const tabHref = (t: InventoryTab) => (t === 'tong-quan' ? base : `${base}?tab=${t}`)
  const pageHref = (p: number) => {
    const query = new URLSearchParams()
    if (tab !== 'tong-quan') query.set('tab', tab)
    if (p > 1) query.set('page', String(p))
    if (from && fromDate) query.set('from', from)
    if (to && toDate) query.set('to', to)
    const qs = query.toString()
    return qs ? `${base}?${qs}` : base
  }
  const pager = (total: number) => {
    const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
    if (lastPage <= 1) return null
    return (
      <div className="flex items-center justify-end gap-3 text-sm">
        {pageNum > 1 ? (
          <Link href={pageHref(pageNum - 1)} className="text-primary underline underline-offset-2">
            {vi.inventory.pagePrev}
          </Link>
        ) : (
          <span className="text-muted-foreground">{vi.inventory.pagePrev}</span>
        )}
        <span className="text-muted-foreground">
          {vi.inventory.pageOf} {Math.min(pageNum, lastPage)}/{lastPage}
        </span>
        {pageNum < lastPage ? (
          <Link href={pageHref(pageNum + 1)} className="text-primary underline underline-offset-2">
            {vi.inventory.pageNext}
          </Link>
        ) : (
          <span className="text-muted-foreground">{vi.inventory.pageNext}</span>
        )}
      </div>
    )
  }
  const TAB_LABELS: Record<InventoryTab, string> = {
    'tong-quan': vi.inventory.tabOverview,
    'so-sach': vi.inventory.tabLedger,
    'do-bon': vi.inventory.tabDips,
    'nhap-hang': vi.inventory.tabImports,
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-muted-foreground text-sm font-medium">{vi.inventory.title}</h2>
        <div className="flex gap-2">
          {canEdit && (
            <FuelImportForm
              stationId={id}
              fuels={stationFuels}
              tanks={tanks}
              paperTanks={paperRoster?.tanks ?? []}
              stationPumps={stationPumps}
              paperPumps={paperRoster?.pumps ?? []}
            />
          )}
          <MovementForm stationId={id} fuels={stationFuels} />
        </div>
      </div>

      {/* Sub-tabs: the overview stays fixed-size, each history paginates. */}
      <nav className="flex gap-4 border-b text-sm">
        {TABS.map((t) => (
          <Link
            key={t}
            href={tabHref(t)}
            className={
              t === tab
                ? 'border-primary -mb-px border-b-2 pb-2 font-semibold'
                : 'text-muted-foreground pb-2'
            }
          >
            {TAB_LABELS[t]}
          </Link>
        ))}
      </nav>

      {tab === 'tong-quan' && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">{vi.inventory.theoreticalTitle}</h3>
              <p className="text-muted-foreground text-xs">
                {vi.inventory.openingNote} {vi.inventory.bookSoldNote}
              </p>
            </div>
            {user.role === 'admin' && (
              <OpeningBalanceForm stationId={id} entries={openingEntries} />
            )}
          </div>
          {bookFuels.length === 0 ? (
            <p className="text-muted-foreground text-sm">{vi.inventory.empty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left">
                    <th className="p-2">{vi.inventory.fuelType}</th>
                    <th className="p-2 text-right">{vi.inventory.openingTitle}</th>
                    <th className="p-2 text-right">+ {vi.inventory.bookImported}</th>
                    <th className="p-2 text-right">− {vi.inventory.bookSold}</th>
                    <th className="p-2 text-right">± {vi.inventory.bookAdjusted}</th>
                    <th className="p-2 text-right">= {vi.inventory.bookStock}</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {bookFuels.map((fuel) => {
                    const book = bookByFuel.get(fuel)!
                    const balance = balances.find((b) => b.fuelType === fuel)
                    const threshold =
                      balance?.lowThreshold != null ? Number(balance.lowThreshold) : null
                    const low = isLowStock(book.summary.bookStock, threshold)
                    return (
                      <tr key={fuel} className="border-b">
                        <td className="p-2 font-medium">{fuelLabel(fuel)}</td>
                        <td className="p-2 text-right">
                          {book.opening ? (
                            <span className="font-mono">
                              {formatLiters(book.summary.openingLiters)}
                              <span className="text-muted-foreground ml-1 text-xs">
                                ({formatDate(book.opening.effectiveDate)})
                              </span>
                            </span>
                          ) : (
                            <StatusBadge label={vi.inventory.noOpening} tone="warning" />
                          )}
                        </td>
                        <td className="p-2 text-right">
                          {/* Every component links to its own evidence trail. */}
                          <Link
                            href={tabHref('nhap-hang')}
                            className="text-primary font-mono underline underline-offset-2"
                          >
                            {formatLiters(book.summary.importedLiters)}
                          </Link>
                        </td>
                        <td className="p-2 text-right">
                          <Link
                            href={`/stations/${id}/shifts`}
                            className="text-primary font-mono underline underline-offset-2"
                          >
                            {formatLiters(book.summary.soldLiters)}
                          </Link>
                        </td>
                        <td className="p-2 text-right font-mono">
                          {book.summary.adjustedLiters === 0
                            ? '—'
                            : formatLiters(book.summary.adjustedLiters)}
                        </td>
                        <td className="p-2 text-right font-mono font-semibold">
                          {formatLiters(book.summary.bookStock)}
                        </td>
                        <td className="p-2">
                          {low && <StatusBadge label={vi.inventory.low} tone="danger" />}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'so-sach' && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{vi.inventory.dailyLedgerTitle}</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="p-2">{vi.inventory.date}</th>
                  <th className="p-2">{vi.inventory.fuelType}</th>
                  <th className="p-2 text-right">{vi.inventory.dayOpening}</th>
                  <th className="p-2 text-right">+ {vi.inventory.bookImported}</th>
                  <th className="p-2 text-right">− {vi.inventory.bookSold}</th>
                  <th className="p-2 text-right">± {vi.inventory.bookAdjusted}</th>
                  <th className="p-2 text-right">= {vi.inventory.dayClosing}</th>
                </tr>
              </thead>
              <tbody>
                {ledgerPage.map((row) => (
                  <tr key={`${row.date}-${row.fuel}`} className="border-b">
                    <td className="p-2">{row.date.split('-').reverse().join('/')}</td>
                    <td className="p-2">{fuelLabel(row.fuel)}</td>
                    <td className="p-2 text-right font-mono">{formatLiters(row.openingOfDay)}</td>
                    <td className="p-2 text-right font-mono">
                      {row.importedLiters === 0 ? '—' : formatLiters(row.importedLiters)}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {row.soldLiters === 0 ? '—' : formatLiters(row.soldLiters)}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {row.adjustedLiters === 0 ? '—' : formatLiters(row.adjustedLiters)}
                    </td>
                    <td className="p-2 text-right font-mono font-semibold">
                      {formatLiters(row.closingOfDay)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pager(ledgerTotal)}
        </section>
      )}

      {tab === 'tong-quan' && (
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
                          ? fuelLabel(dip.fuelType)
                          : fuelForTank.get(tankCode)
                            ? fuelLabel(fuelForTank.get(tankCode)!)
                            : '—'}
                      </td>
                      <td className="p-2 text-right font-mono">
                        {dip?.dipValue.toString() ?? '—'}
                      </td>
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
                        {dip?.isReserve && (
                          <StatusBadge label={vi.inventory.reserve} tone="muted" />
                        )}
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
      )}

      {tab === 'tong-quan' && compareFuels.length > 0 && (
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
                // Sổ sách side = the anchored book stock, same figure as above.
                const theoretical = bookByFuel.get(fuel)?.summary.bookStock ?? 0
                const actual = actualByFuel.get(fuel)
                // Every tank of the fuel must be measured AND resolved by the
                // Barem before the comparison means anything.
                const comparable = actual !== undefined && !incompleteFuels.has(fuel)
                const diff = comparable ? theoretical - actual : null
                return (
                  <tr key={fuel} className="border-b">
                    <td className="p-2 font-medium">{fuelLabel(fuel)}</td>
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

      {tab === 'do-bon' && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{vi.inventory.dipHistory}</h3>
          {dipsPage.length === 0 ? (
            <p className="text-muted-foreground text-sm">{vi.inventory.noDips}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left">
                    <th className="p-2">{vi.inventory.measuredAt}</th>
                    <th className="p-2">{vi.inventory.tank}</th>
                    <th className="p-2">{vi.inventory.fuelType}</th>
                    <th className="p-2 text-right">{vi.inventory.dipValue}</th>
                    <th className="p-2 text-right">{vi.inventory.actualLiters}</th>
                    <th className="p-2 text-right">{vi.inventory.dipDelta}</th>
                    <th className="p-2">{vi.inventory.photo}</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {dipsPage.map((dip) => {
                    const lookup = baremByTank
                      ? lookupBaremLiters(
                          baremByTank.get(dip.tankCode),
                          Math.round(Number(dip.dipValue))
                        )
                      : null
                    const url = dip.photoId ? dipPhotoUrl.get(dip.photoId) : undefined
                    return (
                      <tr key={dip.id} className="border-b">
                        <td className="p-2">{formatDateTime(dip.measuredAt)}</td>
                        <td className="p-2 font-medium">{dip.tankCode.replace('HAM_', 'Hầm ')}</td>
                        <td className="p-2">{dip.fuelType ? fuelLabel(dip.fuelType) : '—'}</td>
                        <td className="p-2 text-right font-mono">{dip.dipValue.toString()}</td>
                        <td className="p-2 text-right font-mono">
                          {lookup?.ok ? (
                            formatLiters(lookup.liters)
                          ) : lookup ? (
                            <span className="text-muted-foreground text-xs">
                              {refusalLabel[lookup.reason]}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="p-2 text-right font-mono">
                          {dip.deltaFromPrevious?.toString() ?? '—'}
                        </td>
                        <td className="p-2">
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary underline underline-offset-2"
                            >
                              {vi.inventory.photo}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="space-x-1 p-2">
                          {dip.isReserve && (
                            <StatusBadge label={vi.inventory.reserve} tone="muted" />
                          )}
                          {dip.isAnomaly && (
                            <StatusBadge label={vi.inventory.reserveChanged} tone="danger" />
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {pager(dipsTotal)}
        </section>
      )}

      {tab === 'nhap-hang' && (
        <section id="lich-su-nhap-hang" className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-muted-foreground text-sm font-medium">{vi.imports.recent}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <ImportFilterForm
                from={from && fromDate ? from : undefined}
                to={to && toDate ? to : undefined}
              />
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
                  <th className="p-2">{vi.imports.savedAt}</th>
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
                        <Link
                          href={`/stations/${id}/imports/${row.receiptId}`}
                          className="text-primary underline underline-offset-2"
                        >
                          {formatDate(row.importedAt)}
                        </Link>
                      ) : (
                        formatDate(row.importedAt)
                      )}
                    </td>
                    {/* When the slip was keyed into the app — the delivery date
                        beside it can be days older than the data entry. */}
                    <td className="p-2">{formatDateTime(row.createdAt)}</td>
                    <td className="p-2">{row.tankCode.replace('HAM_', 'Hầm ')}</td>
                    <td className="p-2">{fuelLabel(row.fuelType)}</td>
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
          {pager(importsTotal)}
        </section>
      )}
    </div>
  )
}
