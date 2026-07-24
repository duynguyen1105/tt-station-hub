import { ReviewTabs } from '@/components/review/review-tabs'
import { ReadingRow, type ReadingRowData } from '@/components/shifts/reading-row'
import { type ShiftStatus } from '@/lib/auth/reading-policy'
import { requireUser } from '@/lib/auth/session'
import { sweepStrayDebtMeters } from '@/lib/debts/stray-sweep'
import { readingPhotosForSlots } from '@/lib/photos/reading-photos'
import { prisma } from '@/lib/prisma'
import { signedUrlsForPhotoIds } from '@/lib/storage/photo-storage'
import { vi } from '@/messages/vi'

export default async function ReviewShiftsPage() {
  const user = await requireUser()

  // Lazy rescue of misclassified shift photos stuck as unpaired debt visits —
  // exactly the moment a reviewer would notice one missing.
  await sweepStrayDebtMeters().catch(() => 0)

  const readings = await prisma.shiftReading.findMany({
    where: { reviewStatus: { in: ['pending', 'needs_review'] } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const shiftIds = [...new Set(readings.map((r) => r.shiftId))]
  const dispenserIds = [...new Set(readings.map((r) => r.dispenserId))]
  const [shifts, dispensers] = await Promise.all([
    prisma.shift.findMany({ where: { id: { in: shiftIds } } }),
    prisma.dispenser.findMany({ where: { id: { in: dispenserIds } } }),
  ])
  const stations = await prisma.station.findMany({
    where: { id: { in: [...new Set(shifts.map((s) => s.stationId))] } },
  })

  const shiftById = new Map(shifts.map((s) => [s.id, s]))
  const dispenserById = new Map(dispensers.map((d) => [d.id, d]))
  const stationById = new Map(stations.map((s) => [s.id, s]))

  // ALL photos matched to these readings (a cross-check pair shoots the same
  // meter twice), signed so the reviewer can compare every original inline.
  const matchedPhotos = await prisma.shiftPhoto.findMany({
    where: { matchedReadingId: { in: readings.map((r) => r.id) } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, matchedReadingId: true, meterType: true, extractedReading: true },
  })
  const photoUrlById = await signedUrlsForPhotoIds(prisma, [
    ...matchedPhotos.map((p) => p.id),
    ...readings.flatMap((r) => [r.electronicPhotoId, r.mechanicalPhotoId]),
  ])

  const photosByReading = new Map(
    readings.map((r) => [r.id, readingPhotosForSlots(r, matchedPhotos, photoUrlById)])
  )
  // Reserve each closing column's photo slot by its widest row so the readings
  // align; an all-single-photo column reserves nothing (no placeholder gap).
  const electronicSlots = Math.max(
    1,
    ...readings.map((r) => photosByReading.get(r.id)?.electronic?.length ?? 0)
  )
  const mechanicalSlots = Math.max(
    1,
    ...readings.map((r) => photosByReading.get(r.id)?.mechanical?.length ?? 0)
  )

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{vi.review.shiftsTitle}</h1>
      <ReviewTabs />
      {readings.length === 0 ? (
        <p className="text-muted-foreground text-sm">{vi.review.empty}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th className="p-2">{vi.review.station}</th>
              <th className="p-2">{vi.shifts.dispenser}</th>
              <th className="p-2">{vi.shifts.openingElectronic}</th>
              <th className="p-2">{vi.shifts.closingElectronic}</th>
              <th className="p-2">{vi.shifts.openingMechanical}</th>
              <th className="p-2">{vi.shifts.closingMechanical}</th>
              <th className="p-2">{vi.shifts.status}</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {readings.map((reading) => {
              const shift = shiftById.get(reading.shiftId)
              const station = shift ? stationById.get(shift.stationId) : undefined
              const dispenser = dispenserById.get(reading.dispenserId)
              const slotPhotos = photosByReading.get(reading.id)!
              const data: ReadingRowData = {
                readingId: reading.id,
                stationName: station?.name ?? '—',
                dispenserName: dispenser?.displayName ?? '—',
                fuelType: dispenser?.fuelType ?? '',
                openingElectronicReading: reading.openingElectronicReading?.toString() ?? null,
                electronicReading: reading.electronicReading?.toString() ?? null,
                openingMechanicalReading: reading.openingMechanicalReading?.toString() ?? null,
                mechanicalReading: reading.mechanicalReading?.toString() ?? null,
                electronicConfidence: reading.aiElectronicConfidence ?? null,
                mechanicalConfidence: reading.aiMechanicalConfidence ?? null,
                electronicPhotos: slotPhotos.electronic,
                mechanicalPhotos: slotPhotos.mechanical,
                reviewStatus: reading.reviewStatus,
                anomalyReasons: reading.anomalyReasons,
                role: user.role,
                shiftStatus: (shift?.status ?? 'pending_review') as ShiftStatus,
              }
              return (
                <ReadingRow
                  key={reading.id}
                  data={data}
                  electronicSlots={electronicSlots}
                  mechanicalSlots={mechanicalSlots}
                />
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
