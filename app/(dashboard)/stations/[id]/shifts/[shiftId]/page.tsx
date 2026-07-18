import { notFound } from 'next/navigation'

import { StatusBadge } from '@/components/shared/status-badge'
import { ReadingRow, type ReadingRowData } from '@/components/shifts/reading-row'
import { ShiftCompleteButton } from '@/components/shifts/shift-complete-button'
import { requireUser } from '@/lib/auth/session'
import { formatDate } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { shiftStatusInfo, shiftTypeLabel } from '@/lib/ui/status'
import { vi } from '@/messages/vi'

export default async function ShiftDetailPage({
  params,
}: {
  params: Promise<{ id: string; shiftId: string }>
}) {
  await requireUser()
  const { shiftId } = await params

  const shift = await prisma.shift.findUnique({ where: { id: shiftId } })
  if (!shift) notFound()

  const [readings, dispensers] = await Promise.all([
    prisma.shiftReading.findMany({ where: { shiftId } }),
    prisma.dispenser.findMany({
      where: { stationId: shift.stationId, isActive: true },
      orderBy: { displayOrder: 'asc' },
    }),
  ])

  const readingByDispenser = new Map(readings.map((r) => [r.dispenserId, r]))
  const rows: ReadingRowData[] = dispensers.map((d) => {
    const r = readingByDispenser.get(d.id)
    return {
      readingId: r?.id ?? null,
      dispenserName: d.displayName,
      fuelType: d.fuelType,
      openingElectronicReading: r?.openingElectronicReading?.toString() ?? null,
      electronicReading: r?.electronicReading?.toString() ?? null,
      openingMechanicalReading: r?.openingMechanicalReading?.toString() ?? null,
      mechanicalReading: r?.mechanicalReading?.toString() ?? null,
      electronicConfidence: r?.aiElectronicConfidence ?? null,
      mechanicalConfidence: r?.aiMechanicalConfidence ?? null,
      reviewStatus: r?.reviewStatus ?? null,
      anomalyReasons: r?.anomalyReasons ?? [],
    }
  })

  const status = shiftStatusInfo(shift.status)
  const pendingCount = readings.filter(
    (r) => r.reviewStatus === 'pending' || r.reviewStatus === 'needs_review'
  ).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">
            {vi.shifts.title} — {formatDate(shift.shiftDate)} · {shiftTypeLabel(shift.shiftType)}
          </h2>
          <StatusBadge label={status.label} tone={status.tone} />
        </div>
        <ShiftCompleteButton
          shiftId={shift.id}
          disabled={shift.status === 'completed' || pendingCount > 0}
        />
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{vi.shifts.noReadings}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left">
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
            {rows.map((row, index) => (
              <ReadingRow key={row.readingId ?? index} data={row} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
