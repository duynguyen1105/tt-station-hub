import { ExportPreflightDialog } from '@/components/misa-export/export-preflight-dialog'
import { StatusBadge } from '@/components/shared/status-badge'
import { requireUser } from '@/lib/auth/session'
import { reachableStationIds } from '@/lib/auth/station-guard'
import { formatDate } from '@/lib/format'
import { APPROVED_VISIT_STATUSES } from '@/lib/misa-export/debts-list'
import { prisma } from '@/lib/prisma'
import { shiftIdsWithLateDebtApproval, visitDateSpan } from '@/lib/shifts/late-debt-approval'
import { shiftTypeLabel } from '@/lib/ui/status'
import { vi } from '@/messages/vi'

export default async function MisaExportPage() {
  const user = await requireUser()
  // A kế toán is offered the ca of the trạm they are phụ trách of, and the
  // narrowing happens in the query: the fifty rows below are fifty rows of their
  // own work rather than whatever survives someone else's more recent ca. Phụ
  // trách of none is the empty table, not an error.
  const stationIds = await reachableStationIds(user)
  const [shifts, stations] = await Promise.all([
    prisma.shift.findMany({
      where: { status: 'completed', stationId: { in: stationIds } },
      orderBy: { completedAt: 'desc' },
      take: 50,
    }),
    prisma.station.findMany({
      where: { id: { in: stationIds } },
      select: { id: true, name: true },
    }),
  ])
  const stationNameById = new Map(stations.map((s) => [s.id, s.name]))

  // Which of these ca gained a bán nợ after it was chốt'd — read here, where the ca
  // is offered for export, because that is where an out-of-date MISA file is about to
  // be trusted. One query for the whole table, bounded by the ngày the fifty ca span.
  const span = visitDateSpan(shifts)
  const reviewedVisits =
    span === null
      ? []
      : await prisma.debtVehicleVisit.findMany({
          where: {
            stationId: { in: stationIds },
            reviewStatus: { in: APPROVED_VISIT_STATUSES },
            visitDate: { gte: span.start, lt: span.end },
            reviewedAt: { not: null },
          },
          select: { stationId: true, visitDate: true, reviewStatus: true, reviewedAt: true },
        })
  const lateDebtShiftIds = shiftIdsWithLateDebtApproval(shifts, reviewedVisits)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{vi.nav.misaReport}</h1>
      {shifts.length === 0 ? (
        <p className="text-muted-foreground text-sm">{vi.shifts.empty}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th className="p-2">{vi.shifts.station}</th>
              <th className="p-2">{vi.shifts.date}</th>
              <th className="p-2">{vi.shifts.shiftType}</th>
              <th className="p-2"></th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((shift) => (
              <tr key={shift.id} className="border-b">
                <td className="p-2">{stationNameById.get(shift.stationId) ?? '—'}</td>
                <td className="p-2">{formatDate(shift.shiftDate)}</td>
                <td className="p-2">{shiftTypeLabel(shift.shiftType)}</td>
                <td className="p-2">
                  {lateDebtShiftIds.has(shift.id) && (
                    <StatusBadge label={vi.shifts.lateDebtApproval} tone="warning" />
                  )}
                </td>
                <td className="p-2 text-right">
                  <ExportPreflightDialog
                    shiftId={shift.id}
                    stationId={shift.stationId}
                    shiftDate={shift.shiftDate.toISOString().slice(0, 10)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
