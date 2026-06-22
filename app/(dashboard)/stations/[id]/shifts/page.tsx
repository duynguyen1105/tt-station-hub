import { ChevronRight } from 'lucide-react'

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
    <div className="overflow-hidden rounded-lg border">
      <div className="text-muted-foreground bg-muted/50 grid grid-cols-[1.2fr_1fr_1fr_auto] items-center gap-3 border-b px-3 py-2.5">
        <span className="label-micro">{vi.shifts.date}</span>
        <span className="label-micro">{vi.shifts.shiftType}</span>
        <span className="label-micro">{vi.shifts.status}</span>
        <span></span>
      </div>
      {shifts.map((shift) => {
        const status = shiftStatusInfo(shift.status)
        return (
          <Link
            key={shift.id}
            href={`/stations/${id}/shifts/${shift.id}`}
            className="hover:bg-muted/40 grid grid-cols-[1.2fr_1fr_1fr_auto] items-center gap-3 border-b px-3 py-3 text-sm transition-colors last:border-0"
          >
            <span>{formatDate(shift.shiftDate)}</span>
            <span>{shiftTypeLabel(shift.shiftType)}</span>
            <span>
              <StatusBadge label={status.label} tone={status.tone} />
            </span>
            <span className="text-primary inline-flex items-center gap-1 font-medium whitespace-nowrap">
              {vi.shifts.viewDetail}
              <ChevronRight className="size-4" />
            </span>
          </Link>
        )
      })}
    </div>
  )
}
