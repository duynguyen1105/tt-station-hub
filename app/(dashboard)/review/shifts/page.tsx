import Link from 'next/link'

import { StatusBadge } from '@/components/shared/status-badge'
import { requireUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'
import { reviewStatusInfo } from '@/lib/ui/status'
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
              <th className="p-2">{vi.shifts.status}</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {readings.map((reading) => {
              const shift = shiftById.get(reading.shiftId)
              const station = shift ? stationById.get(shift.stationId) : undefined
              const dispenser = dispenserById.get(reading.dispenserId)
              const info = reviewStatusInfo(reading.reviewStatus)
              return (
                <tr key={reading.id} className="border-b">
                  <td className="p-2">{station?.name ?? '—'}</td>
                  <td className="p-2">{dispenser?.displayName ?? '—'}</td>
                  <td className="p-2">
                    <StatusBadge label={info.label} tone={info.tone} />
                  </td>
                  <td className="p-2 text-right">
                    {shift && station && (
                      <Link
                        href={`/stations/${station.id}/shifts/${shift.id}`}
                        className="text-primary hover:underline"
                      >
                        {vi.common.actions}
                      </Link>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
