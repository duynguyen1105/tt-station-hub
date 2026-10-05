import Link from 'next/link'

import { ReviewTabs } from '@/components/review/review-tabs'
import { ReadingRow, type ReadingRowData } from '@/components/shifts/reading-row'
import { type ShiftStatus } from '@/lib/auth/reading-policy'
import { requireUser } from '@/lib/auth/session'
import { reachableShiftIds, reachableStationIds, stationIdFromSlug } from '@/lib/auth/station-guard'
import { readingPhotosForSlots } from '@/lib/photos/reading-photos'
import { prisma } from '@/lib/prisma'
import { stationSlug } from '@/lib/stations/href'
import { signedUrlsForPhotoIds } from '@/lib/storage/photo-storage'
import { vi } from '@/messages/vi'

export default async function ReviewShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ station?: string }>
}) {
  const user = await requireUser()
  const params = await searchParams

  // A kế toán is offered the ca of the trạm they are phụ trách of and no other,
  // so the hundred rows below are a hundred rows of their own work.
  const reviewableShiftIds = await reachableShiftIds(user)
  const reachableIds = await reachableStationIds(user)
  const pickedId = await stationIdFromSlug(params.station)
  const stationFilter = pickedId && reachableIds.includes(pickedId) ? pickedId : null

  const queueWhere = {
    reviewStatus: { in: ['pending', 'needs_review'] as ('pending' | 'needs_review')[] },
    ...(reviewableShiftIds !== null && { shiftId: { in: reviewableShiftIds } }),
  }

  // A reading has no trạm of its own: count per ca, then map each ca to its trạm.
  const [countRows, chipStations] = await Promise.all([
    prisma.shiftReading.groupBy({ by: ['shiftId'], where: queueWhere, _count: true }),
    prisma.station.findMany({
      where: { isActive: true, id: { in: reachableIds } },
      orderBy: { code: 'asc' },
      select: { id: true, code: true },
    }),
  ])
  const countedShifts = await prisma.shift.findMany({
    where: { id: { in: countRows.map((r) => r.shiftId) } },
    select: { id: true, stationId: true },
  })
  const stationOfShift = new Map(countedShifts.map((s) => [s.id, s.stationId]))
  const countByStation = new Map<string, number>()
  for (const row of countRows) {
    const stationId = stationOfShift.get(row.shiftId)
    if (stationId) countByStation.set(stationId, (countByStation.get(stationId) ?? 0) + row._count)
  }
  const total = countRows.reduce((sum, r) => sum + r._count, 0)

  const readings = await prisma.shiftReading.findMany({
    where: {
      ...queueWhere,
      ...(stationFilter && {
        shiftId: {
          in: countedShifts.filter((s) => s.stationId === stationFilter).map((s) => s.id),
        },
      }),
    },
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
      {chipStations.length > 1 && (
        <nav className="flex flex-wrap gap-2 text-sm" aria-label={vi.debtReview.stationFilter}>
          {[
            { id: null, code: null, label: vi.debtReview.allStations, count: total },
            ...chipStations
              .filter((s) => countByStation.has(s.id) || s.id === stationFilter)
              .map((s) => ({
                id: s.id,
                code: s.code,
                label: s.code,
                count: countByStation.get(s.id) ?? 0,
              })),
          ].map((chip) => (
            <Link
              key={chip.id ?? 'all'}
              href={
                chip.code ? `/review/shifts?station=${stationSlug(chip.code)}` : '/review/shifts'
              }
              aria-current={chip.id === stationFilter ? 'page' : undefined}
              className={
                chip.id === stationFilter
                  ? 'bg-primary text-primary-foreground rounded-full px-3 py-1 font-medium'
                  : 'hover:bg-muted rounded-full border px-3 py-1'
              }
            >
              {chip.label} ({chip.count})
            </Link>
          ))}
        </nav>
      )}
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
                shiftId: reading.shiftId,
                dispenserId: reading.dispenserId,
                stationCode: station?.code ?? '—',
                dispenserName: dispenser?.displayName ?? '—',
                fuelType: reading.fuelType,
                // A trụ since removed shows both, as it was read.
                hasElectronicMeter: dispenser?.hasElectronicMeter ?? true,
                hasMechanicalMeter: dispenser?.hasMechanicalMeter ?? true,
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
