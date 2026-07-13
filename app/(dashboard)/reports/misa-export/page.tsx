import { ExportPreflightDialog } from '@/components/misa-export/export-preflight-dialog'
import { StatusBadge } from '@/components/shared/status-badge'
import { requireUser } from '@/lib/auth/session'
import { formatDate } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { shiftTypeLabel } from '@/lib/ui/status'
import { vi } from '@/messages/vi'

export default async function MisaExportPage() {
  await requireUser()
  const shifts = await prisma.shift.findMany({
    where: { status: 'completed' },
    orderBy: { completedAt: 'desc' },
    take: 50,
  })

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{vi.nav.misaReport}</h1>
      <StatusBadge label="Mẫu MISA tạm — chờ template chính thức (§13.1)" tone="warning" />
      {shifts.length === 0 ? (
        <p className="text-muted-foreground text-sm">{vi.shifts.empty}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th className="p-2">{vi.shifts.date}</th>
              <th className="p-2">{vi.shifts.shiftType}</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((shift) => (
              <tr key={shift.id} className="border-b">
                <td className="p-2">{formatDate(shift.shiftDate)}</td>
                <td className="p-2">{shiftTypeLabel(shift.shiftType)}</td>
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
