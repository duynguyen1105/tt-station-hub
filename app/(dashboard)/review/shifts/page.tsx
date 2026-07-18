import { ReadingRow, type ReadingRowData } from '@/components/shifts/reading-row'
import { requireUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

export default async function ReviewShiftsPage() {
  await requireUser()

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

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{vi.review.shiftsTitle}</h1>
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
                reviewStatus: reading.reviewStatus,
                anomalyReasons: reading.anomalyReasons,
              }
              return <ReadingRow key={reading.id} data={data} />
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
