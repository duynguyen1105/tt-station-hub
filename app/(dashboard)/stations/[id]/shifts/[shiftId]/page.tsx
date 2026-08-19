import { notFound } from 'next/navigation'

import { FuelImportForm, type TankOption } from '@/components/inventory/fuel-import-form'
import { PhotoView } from '@/components/shared/photo-view'
import { StatusBadge } from '@/components/shared/status-badge'
import { ReadingRow, type ReadingRowData } from '@/components/shifts/reading-row'
import { ShiftCompleteButton } from '@/components/shifts/shift-complete-button'
import { type ShiftStatus, canReviewShift } from '@/lib/auth/reading-policy'
import { requireUser } from '@/lib/auth/session'
import { requireStationAccess } from '@/lib/auth/station-guard'
import { formatDate, formatLiters } from '@/lib/format'
import { fuelTypeLabeller, loadFuelCatalogue, loadStationFuels } from '@/lib/fuels/load-catalogue'
import { stationPumpsFromDispensers } from '@/lib/imports/pump-rows'
import { rosterForStation } from '@/lib/imports/station-rosters'
import {
  type DebtCustomerInput,
  buildDebtsList,
  debtVisitSelection,
} from '@/lib/misa-export/debts-list'
import { readingPhotosForSlots } from '@/lib/photos/reading-photos'
import { prisma } from '@/lib/prisma'
import { signedUrlsForPhotoIds } from '@/lib/storage/photo-storage'
import { shiftStatusInfo, shiftTypeLabel } from '@/lib/ui/status'
import { vi } from '@/messages/vi'

function buildTankOptionsFromDispensers(
  dispensers: {
    tankCode: string | null
    fuelType: string
    tankCapacityK: number | null
  }[],
  fuelLabel: (fuelType: string) => string
): TankOption[] {
  const options = new Map<string, TankOption>()
  for (const d of dispensers) {
    if (!d.tankCode || options.has(d.tankCode)) continue
    const cap = d.tankCapacityK ? ` (${d.tankCapacityK}K)` : ''
    options.set(d.tankCode, {
      code: d.tankCode,
      label: `${d.tankCode.replace('HAM_', 'Hầm ')} — ${fuelLabel(d.fuelType)}${cap}`,
      fuelType: d.fuelType,
      capacityK: d.tankCapacityK,
    })
  }
  return [...options.values()].sort((a, b) => a.code.localeCompare(b.code))
}

export default async function ShiftDetailPage({
  params,
}: {
  params: Promise<{ id: string; shiftId: string }>
}) {
  const user = await requireUser()
  const { shiftId } = await params

  const shift = await prisma.shift.findUnique({ where: { id: shiftId } })
  if (!shift) notFound()
  // Gated on the ca's own trạm rather than the address it was reached at, so a
  // ca cannot be read through the address of a trạm the kế toán does hold.
  await requireStationAccess(shift.stationId)
  // The tên nhiên liệu this page shows — on each hầm of the nhập hàng dialog and on
  // each bán nợ row — read from the danh mục once for the request.
  const fuelLabel = await fuelTypeLabeller()
  // What this trạm sells, for the nhập hàng dialog's ô chọn nhiên liệu. Labels above
  // resolve every khóa; this narrows what a new hầm row may be given.
  const stationFuels = await loadStationFuels(shift.stationId)

  const [station, readings, dispensers, visits] = await Promise.all([
    prisma.station.findUnique({ where: { id: shift.stationId }, select: { code: true } }),
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
  // ALL photos matched to the shift readings (a cross-check pair shoots the same
  // meter twice) plus the debt visits' photo pairs.
  const matchedPhotos = await prisma.shiftPhoto.findMany({
    where: { matchedReadingId: { in: readings.map((r) => r.id) } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, matchedReadingId: true, meterType: true, extractedReading: true },
  })
  const photoUrlById = await signedUrlsForPhotoIds(prisma, [
    ...matchedPhotos.map((p) => p.id),
    ...readings.flatMap((r) => [r.electronicPhotoId, r.mechanicalPhotoId]),
    ...visits.flatMap((v) => [v.vehiclePhotoId, v.meterPhotoId]),
  ])

  // What this Trạm's own pre-printed biên bản lists, and section (d)'s rows with
  // the Hầm each Trụ draws from — what says which (c) row a moving Trụ taints.
  const paperRoster = station ? rosterForStation(station.code) : undefined
  const stationPumps = stationPumpsFromDispensers(dispensers)

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
    customersById,
    // The tên nhiên liệu on each bán nợ row, read from the danh mục for this request.
    await loadFuelCatalogue()
  )

  const readingByDispenser = new Map(readings.map((r) => [r.dispenserId, r]))
  const rows: ReadingRowData[] = dispensers.map((d) => {
    const r = readingByDispenser.get(d.id)
    const slotPhotos = r ? readingPhotosForSlots(r, matchedPhotos, photoUrlById) : null
    return {
      readingId: r?.id ?? null,
      shiftId,
      dispenserId: d.id,
      dispenserName: d.displayName,
      fuelType: d.fuelType,
      openingElectronicReading: r?.openingElectronicReading?.toString() ?? null,
      electronicReading: r?.electronicReading?.toString() ?? null,
      openingMechanicalReading: r?.openingMechanicalReading?.toString() ?? null,
      mechanicalReading: r?.mechanicalReading?.toString() ?? null,
      electronicConfidence: r?.aiElectronicConfidence ?? null,
      mechanicalConfidence: r?.aiMechanicalConfidence ?? null,
      electronicPhotos: slotPhotos?.electronic,
      mechanicalPhotos: slotPhotos?.mechanical,
      reviewStatus: r?.reviewStatus ?? null,
      anomalyReasons: r?.anomalyReasons ?? [],
      role: user.role,
      shiftStatus: shift.status as ShiftStatus,
    }
  })

  // Reserve each closing column's photo slot by its widest row so the readings
  // align; an all-single-photo column reserves nothing (no placeholder gap).
  const electronicSlots = Math.max(1, ...rows.map((r) => r.electronicPhotos?.length ?? 0))
  const mechanicalSlots = Math.max(1, ...rows.map((r) => r.mechanicalPhotos?.length ?? 0))

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
        <div className="flex items-center gap-2">
          {/* Nhập hàng lives beside the shift controls: deliveries happen the
              same day the shift is closed, so this is where staff already are. */}
          {user.role !== 'viewer' && (
            <FuelImportForm
              stationId={shift.stationId}
              fuels={stationFuels}
              tanks={buildTankOptionsFromDispensers(dispensers, fuelLabel)}
              paperTanks={paperRoster?.tanks ?? []}
              stationPumps={stationPumps}
              paperPumps={paperRoster?.pumps ?? []}
            />
          )}
          {/* Chốt ca follows canReviewShift; a viewer never sees the control. */}
          {canReviewShift(user.role, shift.status as ShiftStatus) && (
            <ShiftCompleteButton
              shiftId={shift.id}
              disabled={shift.status === 'completed' || pendingCount > 0}
            />
          )}
        </div>
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
              <ReadingRow
                key={row.readingId ?? index}
                data={row}
                electronicSlots={electronicSlots}
                mechanicalSlots={mechanicalSlots}
              />
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
