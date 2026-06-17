import Link from 'next/link'

import { StatusBadge } from '@/components/shared/status-badge'
import { requireUser } from '@/lib/auth/session'
import { formatDate } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { shiftStatusInfo, shiftTypeLabel } from '@/lib/ui/status'
import { vi } from '@/messages/vi'

export default async function StationShiftsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id } = await params
  const shifts = await prisma.shift.findMany({
    where: { stationId: id },
    orderBy: { shiftDate: 'desc' },
    take: 50,
  })

  if (shifts.length === 0) {
    return <p className="text-muted-foreground text-sm">{vi.shifts.empty}</p>
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-muted-foreground border-b text-left">
          <th className="p-2">{vi.shifts.date}</th>
          <th className="p-2">{vi.shifts.shiftType}</th>
          <th className="p-2">{vi.shifts.status}</th>
          <th className="p-2"></th>
        </tr>
      </thead>
      <tbody>
        {shifts.map((shift) => {
          const status = shiftStatusInfo(shift.status)
          return (
            <tr key={shift.id} className="border-b">
              <td className="p-2">{formatDate(shift.shiftDate)}</td>
              <td className="p-2">{shiftTypeLabel(shift.shiftType)}</td>
              <td className="p-2">
                <StatusBadge label={status.label} tone={status.tone} />
              </td>
              <td className="p-2 text-right">
                <Link
                  href={`/stations/${id}/shifts/${shift.id}`}
                  className="text-primary text-sm hover:underline"
                >
                  {vi.stationTabs.shifts}
                </Link>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
