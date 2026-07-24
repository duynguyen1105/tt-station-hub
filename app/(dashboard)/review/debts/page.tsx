import dayjs from 'dayjs'

import { DebtVisitCard } from '@/components/debts/debt-visit-card'
import { ReviewTabs } from '@/components/review/review-tabs'
import { requireUser } from '@/lib/auth/session'
import { sweepStrayDebtMeters } from '@/lib/debts/stray-sweep'
import { prisma } from '@/lib/prisma'
import { getSignedUrl } from '@/lib/storage/photo-storage'
import { vi } from '@/messages/vi'

export default async function ReviewDebtsPage() {
  await requireUser()

  // Lazy rescue of misclassified shift photos stuck as unpaired debt visits.
  await sweepStrayDebtMeters().catch(() => 0)

  const [visits, customers, stations] = await Promise.all([
    prisma.debtVehicleVisit.findMany({
      where: { reviewStatus: { in: ['pending', 'needs_review'] } },
      orderBy: { visitDate: 'desc' },
      take: 100,
    }),
    prisma.debtCustomer.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.station.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

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
  const urlById = new Map<string, string>()
  await Promise.all(
    photos.map(async (p) => {
      if (!p.storagePath) return
      // 8h TTL so an enlarge click still works while the reviewer keeps the page open.
      const url = await getSignedUrl(p.storagePath, 60 * 60 * 8).catch(() => null)
      if (url) urlById.set(p.id, url)
    })
  )

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
                displayedAmount: v.displayedAmount !== null ? Number(v.displayedAmount) : null,
                amountMatchesDisplay: v.amountMatchesDisplay,
                fuelType: v.fuelType,
                customerId: v.customerId,
                autoMatched: v.customerId !== null,
                anomalyReasons: v.anomalyReasons,
                aiConfidence: v.aiConfidence,
                visitTime: dayjs(v.visitDate).format('HH:mm · DD/MM'),
                vehiclePhotoUrl: v.vehiclePhotoId ? (urlById.get(v.vehiclePhotoId) ?? null) : null,
                meterPhotoUrl: v.meterPhotoId ? (urlById.get(v.meterPhotoId) ?? null) : null,
                customers,
                stations,
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
