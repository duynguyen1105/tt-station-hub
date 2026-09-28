import Link from 'next/link'

import { ApprovedTodayList } from '@/components/debts/approved-today-list'
import { DebtVisitCard } from '@/components/debts/debt-visit-card'
import { ReviewTabs } from '@/components/review/review-tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { requireUser } from '@/lib/auth/session'
import { reachableStationIds } from '@/lib/auth/station-guard'
import { approvedTodaySelection, buildApprovedTodayList } from '@/lib/debts/approved-today'
import { boardPriceOf } from '@/lib/debts/board-price'
import { loadStationPrices } from '@/lib/debts/load-board-prices'
import { todayKey } from '@/lib/debts/load-ledger'
import { canEditDebtVisit } from '@/lib/debts/visit-review'
import { readDayKey, readInstantBound } from '@/lib/filters/params'
import { formatDate, vnTime } from '@/lib/format'
import { loadStationFuels } from '@/lib/fuels/load-catalogue'
import { PENDING_VISIT_STATUSES } from '@/lib/misa-export/debts-list'
import { photoDateMismatch, shiftDateFor, shiftTypeFor } from '@/lib/photos/ingest'
import { prisma } from '@/lib/prisma'
import { signedUrlsForPaths } from '@/lib/storage/photo-storage'
import { vi } from '@/messages/vi'

export default async function ReviewDebtsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; day?: string; station?: string }>
}) {
  const user = await requireUser()
  const params = await searchParams
  const decided = user.role === 'admin' && params.view === 'decided'
  const day = readDayKey(params.day) ?? todayKey()

  // The same boundary the Ca queue draws: a kế toán confirms the lượt xe of the
  // trạm they are phụ trách of, and is offered no other trạm to move one to.
  const stationIds = await reachableStationIds(user)
  // One trạm at a time, so lượt xe of different trạm are not duyệt'd side by side; a
  // trạm outside the person's reach is ignored rather than trusted from the URL.
  const station = params.station && stationIds.includes(params.station) ? params.station : null
  const queueWhere = {
    reviewStatus: { in: decided ? ['approved', 'rejected'] : PENDING_VISIT_STATUSES },
    stationId: { in: stationIds },
    ...(decided && {
      visitDate: { gte: readInstantBound(day, 'start'), lte: readInstantBound(day, 'end') },
    }),
  }

  const [visits, approved, customers, stations, countRows] = await Promise.all([
    prisma.debtVehicleVisit.findMany({
      where: { ...queueWhere, ...(station && { stationId: station }) },
      orderBy: { visitDate: 'desc' },
      ...(!decided && { take: 100 }),
    }),
    // What left the hàng đợi today, so a duyệt'd lượt xe stops vanishing without
    // trace. Selected by thời điểm duyệt, so yesterday's lượt xe duyệt'd this
    // morning is here — pointing at yesterday's ca.
    decided
      ? []
      : prisma.debtVehicleVisit.findMany(
          approvedTodaySelection(station ? [station] : stationIds, new Date())
        ),
    prisma.debtCustomer.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.station.findMany({
      where: { isActive: true, id: { in: stationIds } },
      orderBy: { code: 'asc' },
      select: { id: true, code: true },
    }),
    // How many lượt xe each trạm has in this view — the counts on the trạm filter.
    prisma.debtVehicleVisit.groupBy({ by: ['stationId'], where: queueWhere, _count: true }),
  ])
  const countByStation = new Map(countRows.map((r) => [r.stationId, r._count]))
  const total = countRows.reduce((sum, r) => sum + r._count, 0)
  const queueHref = (stationId: string | null) => {
    const q = new URLSearchParams()
    if (decided) q.set('view', 'decided')
    if (decided) q.set('day', day)
    if (stationId) q.set('station', stationId)
    return q.size ? `/review/debts?${q}` : '/review/debts'
  }

  // What each trạm on this page sells, so a card's fuel ô chọn offers that trạm's
  // nhiên liệu and no other's. The queue spans several trạm, so this is per trạm rather
  // than per page; moving a lượt xe to another trạm saves and refreshes, which is what
  // hands the card the new trạm's list. Keyed by the trạm of every visit below, so the
  // lookup that reads it has no miss to answer for.
  const fuelsByStation = new Map(
    await Promise.all(
      [...new Set(visits.map((v) => v.stationId))].map(
        async (stationId) => [stationId, await loadStationFuels(stationId)] as const
      )
    )
  )

  // The bảng giá each trạm on this page sells by, so a card can show the giá bán lẻ its
  // read đơn giá is checked against — the figure a kế toán types in Sửa số if they side with it.
  const pricesByStation = new Map(
    await Promise.all(
      [...fuelsByStation.keys()].map(
        async (stationId) => [stationId, await loadStationPrices(stationId)] as const
      )
    )
  )

  // Where each lượt xe duyệt'd today went: the ca of the lượt xe's own ngày, and the
  // khách hàng it was charged to. Both are looked up per row rather than reused from
  // the queue above — a lượt xe duyệt'd today can be of an earlier ngày, and of a
  // khách hàng no longer active.
  const approvedDays = [
    ...new Map(
      approved.map((v) => {
        const shiftDate = shiftDateFor(v.visitDate.getTime())
        return [shiftDate.toISOString(), shiftDate] as const
      })
    ).values(),
  ]
  const approvedCustomerIds = [
    ...new Set(approved.map((v) => v.customerId).filter((cid): cid is string => cid !== null)),
  ]
  const [approvedShifts, approvedCustomers] = await Promise.all([
    approvedDays.length > 0
      ? prisma.shift.findMany({
          where: {
            stationId: { in: stationIds },
            shiftType: shiftTypeFor(),
            shiftDate: { in: approvedDays },
          },
          select: { id: true, stationId: true, shiftDate: true },
        })
      : [],
    approvedCustomerIds.length > 0
      ? prisma.debtCustomer.findMany({
          where: { id: { in: approvedCustomerIds } },
          select: { id: true, name: true },
        })
      : [],
  ])
  const approvedRows = buildApprovedTodayList(
    approved.map((v) => ({
      id: v.id,
      stationId: v.stationId,
      visitDate: v.visitDate,
      // The selection filters on reviewedAt, so no row here has a null one.
      reviewedAt: v.reviewedAt!,
      plateRead: v.plateRead,
      plateConfirmed: v.plateConfirmed,
      litersRead: v.litersRead !== null ? Number(v.litersRead) : null,
      customerId: v.customerId,
    })),
    approvedShifts,
    new Map(approvedCustomers.map((c) => [c.id, c.name]))
  )

  // Sign the paired photos so the reviewer can check the AI reading against them.
  const photoIds = [
    ...new Set(
      visits.flatMap((v) => [v.vehiclePhotoId, v.meterPhotoId]).filter((x): x is string => !!x)
    ),
  ]
  const photos = photoIds.length
    ? await prisma.shiftPhoto.findMany({
        where: { id: { in: photoIds } },
        select: { id: true, storagePath: true },
      })
    : []
  // One bulk signing call; 8h TTL so an enlarge click still works while the
  // reviewer keeps the page open.
  const urlByPath = await signedUrlsForPaths(
    photos.map((p) => p.storagePath),
    60 * 60 * 8
  )
  const urlById = new Map<string, string>()
  for (const p of photos) {
    const url = p.storagePath ? urlByPath.get(p.storagePath) : undefined
    if (url) urlById.set(p.id, url)
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="label-micro">{vi.debtReview.subtitle}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{vi.debtReview.title}</h1>
      </div>
      <ReviewTabs />
      {user.role === 'admin' && (
        <nav className="flex gap-3 border-b text-sm font-medium" aria-label={vi.debtReview.title}>
          <Link
            href="/review/debts"
            className={decided ? 'text-muted-foreground p-2' : 'border-primary border-b-2 p-2'}
          >
            {vi.debtReview.pendingView}
          </Link>
          <Link
            href={`/review/debts?view=decided&day=${day}`}
            className={decided ? 'border-primary border-b-2 p-2' : 'text-muted-foreground p-2'}
          >
            {vi.debtReview.decidedView}
          </Link>
        </nav>
      )}
      {decided && (
        <form className="flex items-end gap-2">
          <input type="hidden" name="view" value="decided" />
          {station && <input type="hidden" name="station" value={station} />}
          <label className="space-y-1 text-sm">
            <span className="block">{vi.debtReview.visitDay}</span>
            <Input type="date" name="day" defaultValue={day} />
          </label>
          <Button type="submit" variant="outline">
            {vi.debtReview.filterDay}
          </Button>
        </form>
      )}
      {/* Duyệt one trạm at a time: each chip counts that trạm's lượt xe in this view.
          A trạm with none is left off unless it is the one chosen. */}
      {stations.length > 1 && (
        <nav className="flex flex-wrap gap-2 text-sm" aria-label={vi.debtReview.stationFilter}>
          {[
            { id: null, label: vi.debtReview.allStations, count: total },
            ...stations
              .filter((s) => countByStation.has(s.id) || s.id === station)
              .map((s) => ({ id: s.id, label: s.code, count: countByStation.get(s.id) ?? 0 })),
          ].map((chip) => (
            <Link
              key={chip.id ?? 'all'}
              href={queueHref(chip.id)}
              aria-current={chip.id === station ? 'page' : undefined}
              className={
                chip.id === station
                  ? 'bg-primary text-primary-foreground rounded-full px-3 py-1 font-medium'
                  : 'hover:bg-muted rounded-full border px-3 py-1'
              }
            >
              {chip.label} ({chip.count})
            </Link>
          ))}
        </nav>
      )}

      {visits.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {decided ? vi.debtReview.decidedEmpty : vi.debtReview.empty}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visits.map((v) => (
            <DebtVisitCard
              key={v.id}
              canAct={canEditDebtVisit(user.role, v.reviewStatus)}
              data={{
                visitId: v.id,
                stationId: v.stationId,
                reviewStatus: v.reviewStatus,
                plate: v.plateConfirmed ?? v.plateRead,
                senderNote: v.senderNote,
                liters: v.litersRead !== null ? v.litersRead.toString() : null,
                unitPrice: v.unitPriceRead !== null ? v.unitPriceRead.toString() : null,
                computedAmount: v.computedAmount !== null ? Number(v.computedAmount) : null,
                amountOverride: v.amountOverride !== null ? Number(v.amountOverride) : null,
                originalLiters: v.originalLitersRead !== null ? Number(v.originalLitersRead) : null,
                originalUnitPrice:
                  v.originalUnitPriceRead !== null ? Number(v.originalUnitPriceRead) : null,
                displayedAmount: v.displayedAmount !== null ? Number(v.displayedAmount) : null,
                amountMatchesDisplay: v.amountMatchesDisplay,
                fuelType: v.fuelType,
                fuels: fuelsByStation.get(v.stationId)!,
                boardPrice: boardPriceOf(
                  pricesByStation.get(v.stationId)!,
                  v.fuelType,
                  v.visitDate
                ),
                customerId: v.customerId,
                autoMatched: v.customerId !== null,
                anomalyReasons: v.anomalyReasons,
                photoDateWarning:
                  v.photoDate &&
                  photoDateMismatch(v.photoDate.toISOString().slice(0, 10), v.visitDate)
                    ? vi.debtReview.photoDateMismatch(
                        formatDate(v.photoDate),
                        formatDate(shiftDateFor(v.visitDate.getTime()))
                      )
                    : null,
                aiConfidence: v.aiConfidence,
                visitTime: vnTime(v.visitDate).format('HH:mm · DD/MM'),
                vehiclePhotoUrl: v.vehiclePhotoId ? (urlById.get(v.vehiclePhotoId) ?? null) : null,
                meterPhotoUrl: v.meterPhotoId ? (urlById.get(v.meterPhotoId) ?? null) : null,
                customers,
                stations,
              }}
            />
          ))}
        </div>
      )}

      {!decided && <ApprovedTodayList rows={approvedRows} />}
    </div>
  )
}
