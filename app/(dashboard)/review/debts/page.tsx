import { ApprovedTodayList } from '@/components/debts/approved-today-list'
import { DebtVisitCard } from '@/components/debts/debt-visit-card'
import { ReviewTabs } from '@/components/review/review-tabs'
import { requireUser } from '@/lib/auth/session'
import { reachableStationIds } from '@/lib/auth/station-guard'
import { approvedTodaySelection, buildApprovedTodayList } from '@/lib/debts/approved-today'
import { sweepStrayDebtMeters } from '@/lib/debts/stray-sweep'
import { vnTime } from '@/lib/format'
import { loadStationFuels } from '@/lib/fuels/load-catalogue'
import { shiftDateFor, shiftTypeFor } from '@/lib/photos/ingest'
import { prisma } from '@/lib/prisma'
import { signedUrlsForPaths } from '@/lib/storage/photo-storage'
import { vi } from '@/messages/vi'

export default async function ReviewDebtsPage() {
  const user = await requireUser()

  // Lazy rescue of misclassified shift photos stuck as unpaired debt visits.
  // Currently a no-op: the sweep is frozen (see SWEEP_FROZEN in lib/debts/stray-sweep.ts).
  await sweepStrayDebtMeters().catch(() => 0)

  // The same boundary the Ca queue draws: a kế toán confirms the lượt xe of the
  // trạm they are phụ trách of, and is offered no other trạm to move one to.
  const stationIds = await reachableStationIds(user)

  const [visits, approved, customers, stations] = await Promise.all([
    prisma.debtVehicleVisit.findMany({
      // 'corrected' belongs here: Sửa số stamps that status, so leaving it out made a
      // corrected lượt xe vanish from the only screen that can duyệt it — saved, and
      // never charged.
      where: {
        reviewStatus: { in: ['pending', 'needs_review', 'corrected'] },
        stationId: { in: stationIds },
      },
      orderBy: { visitDate: 'desc' },
      take: 100,
    }),
    // What left the hàng đợi today, so a duyệt'd lượt xe stops vanishing without
    // trace. Selected by thời điểm duyệt, so yesterday's lượt xe duyệt'd this
    // morning is here — pointing at yesterday's ca.
    prisma.debtVehicleVisit.findMany(approvedTodaySelection(stationIds, new Date())),
    prisma.debtCustomer.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.station.findMany({
      where: { isActive: true, id: { in: stationIds } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

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

      {visits.length === 0 ? (
        <p className="text-muted-foreground text-sm">{vi.debtReview.empty}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visits.map((v) => (
            <DebtVisitCard
              key={v.id}
              data={{
                visitId: v.id,
                stationId: v.stationId,
                reviewStatus: v.reviewStatus,
                plate: v.plateConfirmed ?? v.plateRead,
                zaloCaption: v.zaloCaption,
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
                customerId: v.customerId,
                autoMatched: v.customerId !== null,
                anomalyReasons: v.anomalyReasons,
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

      <ApprovedTodayList rows={approvedRows} />
    </div>
  )
}
