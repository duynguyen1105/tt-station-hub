import { notFound } from 'next/navigation'

import { PhotoView } from '@/components/shared/photo-view'
import { StatusBadge } from '@/components/shared/status-badge'
import { ReadingRow, type ReadingRowData } from '@/components/shifts/reading-row'
import { ShiftCompleteButton } from '@/components/shifts/shift-complete-button'
import { type ShiftStatus } from '@/lib/auth/reading-policy'
import { requireUser } from '@/lib/auth/session'
import { formatDate, formatLiters } from '@/lib/format'
import {
  type DebtCustomerInput,
  buildDebtsList,
  debtVisitSelection,
} from '@/lib/misa-export/debts-list'
import { prisma } from '@/lib/prisma'
import { signedUrlsForPhotoIds } from '@/lib/storage/photo-storage'
import { shiftStatusInfo, shiftTypeLabel } from '@/lib/ui/status'
import { vi } from '@/messages/vi'

export default async function ShiftDetailPage({
  params,
}: {
  params: Promise<{ id: string; shiftId: string }>
}) {
  const user = await requireUser()
  const { shiftId } = await params

  const shift = await prisma.shift.findUnique({ where: { id: shiftId } })
  if (!shift) notFound()

  const [readings, dispensers, visits] = await Promise.all([
    prisma.shiftReading.findMany({ where: { shiftId } }),
    prisma.dispenser.findMany({
      where: { stationId: shift.stationId, isActive: true },
      orderBy: { displayOrder: 'asc' },
    }),
    prisma.debtVehicleVisit.findMany(debtVisitSelection(shift.stationId, shift.shiftDate)),
  ])

  const customerIds = [
    ...new Set(visits.map((v) => v.customerId).filter((cid): cid is string => cid !== null)),
  ]
  const customerRows =
    customerIds.length > 0
      ? await prisma.debtCustomer.findMany({ where: { id: { in: customerIds } } })
      : []
  // Source photos, signed so the reviewer can check the original image inline —
  // both the shift readings' meter photos and the debt visits' photo pairs.
  const photoUrlById = await signedUrlsForPhotoIds(prisma, [
    ...readings.flatMap((r) => [r.electronicPhotoId, r.mechanicalPhotoId]),
    ...visits.flatMap((v) => [v.vehiclePhotoId, v.meterPhotoId]),
  ])

  const customersById = new Map<string, DebtCustomerInput>(
    customerRows.map((c) => [c.id, { name: c.name, misaCode: c.misaCode }])
  )
  const debtRows = buildDebtsList(
    visits.map((v) => ({
      customerId: v.customerId,
      visitDate: v.visitDate,
      fuelType: v.fuelType,
      litersRead: v.litersRead === null ? null : v.litersRead.toNumber(),
      plateRead: v.plateRead,
      plateConfirmed: v.plateConfirmed,
      vehiclePhotoUrl: v.vehiclePhotoId ? (photoUrlById.get(v.vehiclePhotoId) ?? null) : null,
      meterPhotoUrl: v.meterPhotoId ? (photoUrlById.get(v.meterPhotoId) ?? null) : null,
    })),
    customersById
  )

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
      electronicPhotoUrl: r?.electronicPhotoId
        ? (photoUrlById.get(r.electronicPhotoId) ?? null)
        : null,
      mechanicalPhotoUrl: r?.mechanicalPhotoId
        ? (photoUrlById.get(r.mechanicalPhotoId) ?? null)
        : null,
      reviewStatus: r?.reviewStatus ?? null,
      anomalyReasons: r?.anomalyReasons ?? [],
      role: user.role,
      shiftStatus: shift.status as ShiftStatus,
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

      <section className="space-y-2">
        <h3 className="text-base font-semibold">{vi.shifts.debtsSectionTitle}</h3>
        {debtRows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{vi.shifts.debtsEmpty}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="p-2">{vi.shifts.debtId}</th>
                <th className="p-2">{vi.shifts.debtPhotos}</th>
                <th className="p-2">{vi.shifts.debtCustomer}</th>
                <th className="p-2">{vi.shifts.debtFuel}</th>
                <th className="p-2 text-right">{vi.shifts.debtLiters}</th>
              </tr>
            </thead>
            <tbody>
              {debtRows.map((row, index) => (
                <tr key={index} className="border-b">
                  <td className="p-2 font-mono">
                    {row.idIsMissing ? (
                      <StatusBadge label={vi.debtReview.missingCode} tone="danger" />
                    ) : (
                      row.id
                    )}
                  </td>
                  <td className="p-2">
                    <span className="inline-flex gap-1">
                      <PhotoView url={row.vehiclePhotoUrl} label={vi.debtReview.vehiclePhoto} />
                      <PhotoView url={row.meterPhotoUrl} label={vi.debtReview.meterPhoto} />
                    </span>
                  </td>
                  <td className="p-2">{row.customerName}</td>
                  <td className="p-2">{row.fuelLabel}</td>
                  <td className="p-2 text-right font-mono">{formatLiters(row.liters)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
