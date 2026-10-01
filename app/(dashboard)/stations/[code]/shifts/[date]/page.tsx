import { type ReactNode, Suspense } from 'react'

import Link from 'next/link'
import { notFound } from 'next/navigation'

import { FuelImportForm } from '@/components/inventory/fuel-import-form'
import { StatusBadge } from '@/components/shared/status-badge'
import { CashBalanceCard } from '@/components/shifts/cash-balance-card'
import { CashEntriesTable } from '@/components/shifts/cash-entries-table'
import { PrintButton } from '@/components/shifts/print-button'
import { ReadingRow, type ReadingRowData } from '@/components/shifts/reading-row'
import { ShiftCompleteButton, ShiftReopenButton } from '@/components/shifts/shift-complete-button'
import { ShiftDebtLedger } from '@/components/shifts/shift-debt-ledger'
import { ShiftDebtSales } from '@/components/shifts/shift-debt-sales'
import { ShiftStockSection } from '@/components/shifts/shift-stock-section'
import { ShiftSummary } from '@/components/shifts/shift-summary'
import { UnmatchedPhotos } from '@/components/shifts/unmatched-photos'
import { Skeleton } from '@/components/ui/skeleton'
import {
  type ShiftStatus,
  canEditCashEntries,
  canEditClosing,
  canReviewShift,
} from '@/lib/auth/reading-policy'
import { requireUser } from '@/lib/auth/session'
import { loadStationBySlug, requireStationAccess } from '@/lib/auth/station-guard'
import { chargeAmountOf } from '@/lib/debts/visit-amount'
import { canEditDebtVisit } from '@/lib/debts/visit-review'
import { tankCodesOf, withTanks } from '@/lib/dispensers/tank-links'
import { readDayBound } from '@/lib/filters/params'
import { formatDate, formatDateTime, formatVND } from '@/lib/format'
import {
  fuelTypeLabeller,
  loadFuelCatalogue,
  loadStationFuelMappings,
  loadStationFuels,
} from '@/lib/fuels/load-catalogue'
import { stationPumpsFromDispensers } from '@/lib/imports/pump-rows'
import { rosterForStation } from '@/lib/imports/station-rosters'
import { stationTankOptions } from '@/lib/inventory/tank-options'
import { priceRowOnDate } from '@/lib/misa-export/build-sales-voucher'
import {
  type DebtCustomerInput,
  buildDebtsList,
  debtVisitSelection,
  pendingDebtVisitsWhere,
} from '@/lib/misa-export/debts-list'
import { shiftTypeFor } from '@/lib/photos/ingest'
import { readingPhotosForSlots } from '@/lib/photos/reading-photos'
import { unmatchedPhotoTrace } from '@/lib/photos/unmatched-photos'
import { prisma } from '@/lib/prisma'
import { cashEntryTotals } from '@/lib/shifts/cash-entries'
import { refuseShiftCompletion } from '@/lib/shifts/completion'
import { hasLateDebtApproval } from '@/lib/shifts/late-debt-approval'
import { loadCashBalance } from '@/lib/shifts/load-cash-balance'
import {
  electronicGap,
  mechanicalGap,
  meterGapDifference,
  readingAmount,
} from '@/lib/shifts/reading-totals'
import { stationHref, stationSlug } from '@/lib/stations/href'
import { signedUrlsForPhotoIds } from '@/lib/storage/photo-storage'
import { shiftStatusInfo, shiftTypeLabel } from '@/lib/ui/status'
import { vi } from '@/messages/vi'

/** The jump links under the header, in page order: each names a section's `id`. */
const SECTION_LINKS = [
  { id: 'tru-bom', label: vi.shifts.sections.pumps },
  { id: 'ton-kho', label: vi.shifts.sections.stock },
  { id: 'ban-no', label: vi.shifts.sections.debtSales },
  { id: 'thu-chi', label: vi.shifts.sections.cashEntries },
  { id: 'cong-no', label: vi.shifts.sections.debtLedger },
  { id: 'ton-tien-mat', label: vi.shifts.sections.cashBalance },
]

/** A section's title row, with the link to the tab that manages it beside the title. */
function SectionHeading({
  title,
  href,
  linkLabel,
}: {
  title: string
  href: string
  linkLabel: string
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 print:break-after-avoid">
      <h3 className="text-base font-semibold">{title}</h3>
      <Link href={href} className="text-primary text-sm underline print:hidden">
        {linkLabel}
      </Link>
    </div>
  )
}

/** What a streamed section shows while its rows load. */
function SectionLoading({ label }: { label: string }): ReactNode {
  return (
    <div className="space-y-2" aria-label={label}>
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  )
}

/** A Prisma Decimal meter value as a plain number, or null where no value was read. */
function numberOrNull(value: { toNumber: () => number } | null | undefined): number | null {
  return value == null ? null : value.toNumber()
}

export default async function ShiftDetailPage({
  params,
}: {
  params: Promise<{ code: string; date: string }>
}) {
  const user = await requireUser()
  const { code, date } = await params
  const { id: stationId } = await loadStationBySlug(code)
  // A ca is named by its ngày: every ca is full_day, so a trạm has one per ngày.
  const shiftDate = readDayBound(date)
  if (!shiftDate) notFound()

  const shift = await prisma.shift.findUnique({
    where: {
      stationId_shiftDate_shiftType: { stationId, shiftDate, shiftType: shiftTypeFor() },
    },
  })
  if (!shift) notFound()
  const shiftId = shift.id
  await requireStationAccess(stationId)
  // The tên nhiên liệu this page shows — on each hầm of the nhập hàng dialog and on
  // each bán nợ row — read from the danh mục once for the request.
  const fuelLabel = await fuelTypeLabeller()
  // What this trạm sells, for the nhập hàng dialog's ô chọn nhiên liệu, and its mã
  // hàng, which is what reads a goods column on a biên bản. Labels above resolve every
  // khóa; this narrows what a new hầm row may be given.
  const [stationFuels, fuelMappings, openings] = await Promise.all([
    loadStationFuels(shift.stationId),
    loadStationFuelMappings(shift.stationId),
    // Each nhiên liệu's đầu kỳ date: the dialog warns on a phiếu dated before it.
    prisma.inventoryOpeningBalance.findMany({
      where: { stationId: shift.stationId },
      select: { fuelType: true, effectiveDate: true },
    }),
  ])

  const [station, readings, dispensers, tanks, visits, priceRows, cashEntryRows] =
    await Promise.all([
      prisma.station.findUnique({
        where: { id: shift.stationId },
        // fuelArea rides along with the code: Tổng tiền prices each row by the giá bán
        // lẻ of the trạm's vùng, the same key the MISA export uses.
        select: { code: true, fuelArea: true },
      }),
      prisma.shiftReading.findMany({ where: { shiftId } }),
      prisma.dispenser.findMany({
        where: { stationId: shift.stationId, isActive: true },
        include: withTanks,
        orderBy: { displayOrder: 'asc' },
      }),
      // The hầm as Cấu hình states them, for the nhập hàng picker — see `stationTankOptions`.
      prisma.tank.findMany({
        where: { stationId: shift.stationId },
        select: { code: true, fuelType: true, capacityK: true },
      }),
      prisma.debtVehicleVisit.findMany(debtVisitSelection(shift.stationId, shift.shiftDate)),
      // Both vùng in one read — the trạm's own vùng is only known once the row above
      // lands, and the board holds a handful of rows per nhiên liệu, so narrowing it in
      // memory below costs less than a second round trip.
      prisma.misaRetailPrice.findMany({ orderBy: { effectiveDate: 'asc' } }),
      // Thu chi tiền mặt – Khách CK, the kế toán's note on the ca, in the order typed.
      prisma.shiftCashEntry.findMany({ where: { shiftId }, orderBy: { position: 'asc' } }),
    ])
  // The ca's ngày's lượt bán nợ still in Duyệt công nợ: Chốt ca waits on them, and the
  // Bán nợ list below does not hold them yet. Tồn tiền mặt chains from the đầu kỳ.
  const [pendingDebtVisits, cashBalance] = await Promise.all([
    prisma.debtVehicleVisit.count({
      where: pendingDebtVisitsWhere(shift.stationId, shift.shiftDate),
    }),
    loadCashBalance({ ...shift, fuelArea: station?.fuelArea ?? null }),
  ])
  const cashEntries = cashEntryRows.map((e) => ({
    content: e.content,
    customerId: e.customerId,
    counterparty: e.counterparty,
    receipt: e.receipt?.toString() ?? '',
    payment: e.payment?.toString() ?? '',
    chargesDebt: e.chargesDebt,
    transfer: e.transfer?.toString() ?? '',
    repaysDebt: e.repaysDebt,
  }))
  // Đối tượng's list: this trạm's khách hàng in use — a khách's sổ công nợ belongs to one
  // trạm — plus any a saved row already names, so a retired khách still reads by tên.
  const cashCustomerIds = cashEntryRows.flatMap((e) => (e.customerId ? [e.customerId] : []))
  const cashCustomers = await prisma.debtCustomer.findMany({
    where: {
      OR: [{ stationId: shift.stationId, isActive: true }, { id: { in: cashCustomerIds } }],
    },
    // Listed by mã MISA, what the phiếu chốt names a khách by; khách without one last.
    orderBy: [{ misaCode: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, misaCode: true },
  })

  const customerIds = [
    ...new Set(visits.map((v) => v.customerId).filter((cid): cid is string => cid !== null)),
  ]
  const customerRows =
    customerIds.length > 0
      ? await prisma.debtCustomer.findMany({ where: { id: { in: customerIds } } })
      : []
  // Source photos, signed so the reviewer can check the original image inline —
  // ALL photos matched to the shift readings (a cross-check pair shoots the same
  // meter twice) plus the debt visits' photo pairs, plus the photos the AI could
  // not place on any Trụ, which the reviewer gán by hand below the table.
  const [matchedPhotos, unmatchedCandidates] = await Promise.all([
    prisma.shiftPhoto.findMany({
      where: { matchedReadingId: { in: readings.map((r) => r.id) } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, matchedReadingId: true, meterType: true, extractedReading: true },
    }),
    prisma.shiftPhoto.findMany({
      // 'ambiguous' — a Trụ the label named twice, or a display no reader has a
      // slot for — is as placeless as 'unmatched': no reading holds the photo.
      where: { shiftId, matchStatus: { in: ['unmatched', 'ambiguous'] } },
      orderBy: { receivedAt: 'asc' },
      select: {
        id: true,
        receivedAt: true,
        senderName: true,
        senderNote: true,
        createdAt: true,
        extractedReading: true,
        aiRawResponse: true,
      },
    }),
  ])
  // Debt photos written before intake marked them 'matched' still say
  // 'unmatched'; the lượt xe that holds them is the proof they were placed.
  const placedInVisits =
    unmatchedCandidates.length === 0
      ? []
      : await prisma.debtVehicleVisit.findMany({
          where: {
            OR: [
              { vehiclePhotoId: { in: unmatchedCandidates.map((p) => p.id) } },
              { meterPhotoId: { in: unmatchedCandidates.map((p) => p.id) } },
            ],
          },
          select: { vehiclePhotoId: true, meterPhotoId: true },
        })
  const placedIds = new Set(placedInVisits.flatMap((v) => [v.vehiclePhotoId, v.meterPhotoId]))
  const unmatchedPhotos = unmatchedCandidates.filter((p) => !placedIds.has(p.id))
  const photoUrlById = await signedUrlsForPhotoIds(prisma, [
    ...matchedPhotos.map((p) => p.id),
    ...unmatchedPhotos.map((p) => p.id),
    ...readings.flatMap((r) => [r.electronicPhotoId, r.mechanicalPhotoId]),
    ...visits.flatMap((v) => [v.vehiclePhotoId, v.meterPhotoId]),
  ])

  // What this Trạm's own pre-printed biên bản lists, and section (d)'s rows with
  // the Hầm each Trụ draws from — what says which (c) row a moving Trụ taints.
  const paperRoster = station ? rosterForStation(station.code) : undefined
  const stationPumps = stationPumpsFromDispensers(
    dispensers.map((d) => ({ ...d, tankCodes: tankCodesOf(d) }))
  )

  const customersById = new Map<string, DebtCustomerInput>(
    customerRows.map((c) => [c.id, { name: c.name, misaCode: c.misaCode }])
  )
  const debtRows = buildDebtsList(
    visits.map((v) => ({
      customerId: v.customerId,
      visitDate: v.visitDate,
      fuelType: v.fuelType,
      litersRead: v.litersRead === null ? null : v.litersRead.toNumber(),
      amount: chargeAmountOf({
        litersRead: v.litersRead === null ? null : v.litersRead.toNumber(),
        unitPriceRead: v.unitPriceRead === null ? null : v.unitPriceRead.toNumber(),
        amountOverride: v.amountOverride === null ? null : v.amountOverride.toNumber(),
      }),
      plateRead: v.plateRead,
      plateConfirmed: v.plateConfirmed,
      vehiclePhotoUrl: v.vehiclePhotoId ? (photoUrlById.get(v.vehiclePhotoId) ?? null) : null,
      meterPhotoUrl: v.meterPhotoId ? (photoUrlById.get(v.meterPhotoId) ?? null) : null,
      visitId: v.id,
      reviewStatus: v.reviewStatus,
    })),
    customersById,
    // The tên nhiên liệu on each bán nợ row, read from the danh mục for this request.
    await loadFuelCatalogue()
  )
  // Where a lượt xe of the list is sửa'd: its card on Duyệt công nợ — the đã duyệt ones
  // under Đã quyết định for the ca's ngày (admin), an đã sửa one still in the hàng chờ.
  const debtEditHref = (row: (typeof debtRows)[number]) =>
    row.visitId && row.reviewStatus && canEditDebtVisit(user.role, row.reviewStatus)
      ? row.reviewStatus === 'approved'
        ? `/review/debts?view=decided&day=${shift.shiftDate.toISOString().slice(0, 10)}&station=${stationSlug(code)}#visit-${row.visitId}`
        : `/review/debts?station=${stationSlug(code)}#visit-${row.visitId}`
      : null
  const debtSaleRows = debtRows.map((row) => ({ ...row, editHref: debtEditHref(row) }))

  // The giá bán lẻ of this trạm's vùng, every kỳ of it, so each row can be priced by the
  // one in force on the ca's ngày — a ca opened before a price change still bills at the
  // price it sold at.
  const prices = priceRows
    .filter((p) => p.fuelArea === station?.fuelArea)
    .map((p) => ({
      fuelType: p.fuelType,
      effectiveDate: p.effectiveDate,
      unitPrice: p.unitPrice.toNumber(),
    }))

  const readingByDispenser = new Map(readings.map((r) => [r.dispenserId, r]))
  const rows: ReadingRowData[] = dispensers.map((d) => {
    const r = readingByDispenser.get(d.id)
    const slotPhotos = r ? readingPhotosForSlots(r, matchedPhotos, photoUrlById) : null
    const meters = {
      openingElectronicReading: numberOrNull(r?.openingElectronicReading),
      electronicReading: numberOrNull(r?.electronicReading),
      openingMechanicalReading: numberOrNull(r?.openingMechanicalReading),
      mechanicalReading: numberOrNull(r?.mechanicalReading),
    }
    const unitPrice =
      priceRowOnDate(prices, r?.fuelType ?? d.fuelType, shift.shiftDate)?.unitPrice ?? null
    return {
      readingId: r?.id ?? null,
      shiftId,
      dispenserId: d.id,
      dispenserName: d.displayName,
      // The nhiên liệu this ca was recorded against; a trụ with no reading yet
      // shows what it pumps today.
      fuelType: r?.fuelType ?? d.fuelType,
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
      airPurge: { liters: r?.airPurgeLiters?.toString() ?? null },
      note: { text: r?.note ?? null },
      totals: {
        electronicLiters: electronicGap(meters),
        mechanicalLiters: mechanicalGap(meters),
        gapDifference: meterGapDifference(meters),
        // Priced on the litres sold, so a Xả gió on this trụ takes its own money off.
        amount: readingAmount(meters, unitPrice, numberOrNull(r?.airPurgeLiters)),
      },
      role: user.role,
      shiftStatus: shift.status as ShiftStatus,
    }
  })

  // Reserve each closing column's photo slot by its widest row so the readings
  // align; an all-single-photo column reserves nothing (no placeholder gap).
  const electronicSlots = Math.max(1, ...rows.map((r) => r.electronicPhotos?.length ?? 0))
  const mechanicalSlots = Math.max(1, ...rows.map((r) => r.mechanicalPhotos?.length ?? 0))

  // The giá bán lẻ in force on the ca's ngày for each nhiên liệu the trạm sells, printed
  // at the top of the phiếu as the Excel did.
  const retailPrices = stationFuels.flatMap((fuel) => {
    const price = priceRowOnDate(prices, fuel.fuelType, shift.shiftDate)
    return price ? [{ fuelType: fuel.fuelType, name: fuel.name, unitPrice: price.unitPrice }] : []
  })
  const salesTotal = rows.reduce((sum, r) => sum + (r.totals?.amount ?? 0), 0)
  const cashTotals = cashEntryTotals(cashEntries)
  const shiftDay = shift.shiftDate.toISOString().slice(0, 10)

  const status = shiftStatusInfo(shift.status)
  // Why Chốt ca is refused, read from the same rule the endpoint applies, so the
  // button never offers a chốt the request would turn away.
  const completionRefusal = refuseShiftCompletion(readings, pendingDebtVisits)
  const completed = shift.status === 'completed'
  // A bán nợ duyệt'd after this ca was chốt'd is in the Bán nợ trong ca list below but
  // not in the MISA file already downloaded, so the ca says so where the kế toán reads
  // it. Fed the rows this page already read — the check narrows them itself, so the
  // warning costs no second query.
  const lateDebtApproval = hasLateDebtApproval(shift, visits)
  // The photos the AI left on the ca without a Trụ, with what it saw and why it
  // stopped, for the reviewer to gán by hand. Attaching a photo re-derives a
  // row's value, so it follows the closing-edit rule.
  const unmatchedRows = unmatchedPhotos.map((p) => {
    const trace = unmatchedPhotoTrace(p.aiRawResponse)
    return {
      id: p.id,
      url: photoUrlById.get(p.id) ?? null,
      receivedAt: formatDateTime(p.receivedAt ?? p.createdAt),
      sender: p.senderName,
      senderNote: p.senderNote,
      routerType: trace.routerType,
      reason: trace.reason,
      notes: trace.notes,
      error: trace.error,
      extractedReading: p.extractedReading?.toString() ?? null,
    }
  })
  const assignableDispensers = dispensers.map((d) => ({
    id: d.id,
    name: d.displayName,
    hasElectronicMeter: d.hasElectronicMeter,
    hasMechanicalMeter: d.hasMechanicalMeter,
  }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">
            {vi.shifts.title} — {formatDate(shift.shiftDate)} · {shiftTypeLabel(shift.shiftType)}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={status.label} tone={status.tone} />
            {lateDebtApproval && <StatusBadge label={vi.shifts.lateDebtApproval} tone="warning" />}
            {station?.fuelArea && retailPrices.length > 0 && (
              <span className="text-muted-foreground text-sm">
                {vi.shifts.retailPrices(vi.fuelArea[station.fuelArea])}:{' '}
                {retailPrices.map((p, i) => (
                  <span key={p.fuelType}>
                    {i > 0 && ' · '}
                    {p.name}{' '}
                    <span className="text-foreground font-mono">{formatVND(p.unitPrice)}</span>
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 print:hidden">
          {/* The phiếu on one A4 sheet for the Zalo nhóm — the browser's own print to PDF. */}
          <PrintButton
            title={`${vi.shifts.title} ${station?.code ?? code} ${shiftDay.split('-').reverse().join('-')}`}
          />
          {/* Nhập hàng lives beside the shift controls: deliveries happen the
              same day the shift is closed, so this is where staff already are. */}
          {user.role !== 'viewer' && (
            <FuelImportForm
              stationId={shift.stationId}
              stationCode={code}
              fuels={stationFuels}
              fuelMappings={fuelMappings}
              tanks={stationTankOptions({ tanks, dipTanks: [] }, fuelLabel)}
              paperTanks={paperRoster?.tanks ?? []}
              stationPumps={stationPumps}
              paperPumps={paperRoster?.pumps ?? []}
              openingDates={Object.fromEntries(
                openings.map((o) => [o.fuelType, o.effectiveDate.toISOString().slice(0, 10)])
              )}
              size="default"
            />
          )}
          {completed && user.role === 'admin' && <ShiftReopenButton shiftId={shift.id} />}
          {canReviewShift(user.role, shift.status as ShiftStatus) && (
            <ShiftCompleteButton shiftId={shift.id} disabled={completionRefusal !== null} />
          )}
        </div>
      </div>
      {completed && (
        <p className="text-muted-foreground text-sm print:hidden">{vi.shifts.completedLocked}</p>
      )}
      {/* Below the header, not inside the button row: a reason there widened the row
          until it wrapped under the title, so the buttons moved with the ca's state. */}
      {canReviewShift(user.role, shift.status as ShiftStatus) && completionRefusal && (
        <p className="text-muted-foreground text-sm print:hidden">{completionRefusal}</p>
      )}

      <ShiftSummary
        sales={salesTotal}
        debtSales={debtRows.reduce((sum, r) => sum + (r.amount ?? 0), 0)}
        receipts={cashTotals.receipt}
        payments={cashTotals.payment}
        closingCash={cashBalance.kind === 'line' ? cashBalance.line.closing : null}
      />

      {/* The phiếu is long; these jump to each block and stay under the top bar. */}
      <nav className="bg-background/80 sticky top-14 z-10 -mx-1 flex flex-wrap gap-1 border-b px-1 py-2 backdrop-blur-sm print:hidden">
        {SECTION_LINKS.map((link) => (
          <a
            key={link.id}
            href={`#${link.id}`}
            className="hover:bg-accent rounded-md px-2 py-1 text-sm font-medium"
          >
            {link.label}
          </a>
        ))}
      </nav>

      <section id="tru-bom" className="scroll-mt-28 space-y-2">
        <h3 className="text-base font-semibold">{vi.shifts.sections.pumps}</h3>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{vi.shifts.noReadings}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="p-2">{vi.shifts.dispenser}</th>
                  <th className="p-2">{vi.shifts.openingElectronic}</th>
                  <th className="p-2">{vi.shifts.closingElectronic}</th>
                  <th className="p-2">{vi.shifts.electronicLiters}</th>
                  <th className="p-2">{vi.shifts.openingMechanical}</th>
                  <th className="p-2">{vi.shifts.closingMechanical}</th>
                  <th className="p-2">{vi.shifts.mechanicalLiters}</th>
                  <th className="p-2">{vi.shifts.airPurge}</th>
                  <th className="p-2">{vi.shifts.totalAmount}</th>
                  <th className="p-2">{vi.shifts.status}</th>
                  <th className="p-2">{vi.shifts.note}</th>
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
              {/* The ca's Tổng tiền bán: the rows' Tổng tiền, those with no price or litres skipped. */}
              <tfoot>
                <tr className="font-semibold">
                  <td className="p-2 text-right" colSpan={8}>
                    {vi.shifts.sumTotal}
                  </td>
                  <td className="p-2 font-mono whitespace-nowrap">{formatVND(salesTotal)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="print:hidden">
          <UnmatchedPhotos
            photos={unmatchedRows}
            dispensers={assignableDispensers}
            canAssign={canEditClosing(user.role, shift.status as ShiftStatus)}
          />
        </div>
      </section>

      <section id="ton-kho" className="scroll-mt-28 space-y-2">
        <SectionHeading
          title={vi.shifts.stock.title}
          href={`${stationHref(code)}/inventory`}
          linkLabel={vi.shifts.stock.openTab}
        />
        <Suspense fallback={<SectionLoading label={vi.shifts.stock.loading} />}>
          <ShiftStockSection
            stationId={shift.stationId}
            stationCode={station?.code}
            shiftDate={shift.shiftDate}
            // Until chốt the ca's sales are not in the sổ, so the block adds them itself.
            unbookedReadings={
              completed
                ? null
                : readings.map((r) => ({
                    dispenserId: r.dispenserId,
                    fuelType: r.fuelType,
                    openingElectronicReading: numberOrNull(r.openingElectronicReading),
                    electronicReading: numberOrNull(r.electronicReading),
                    airPurgeLiters: numberOrNull(r.airPurgeLiters),
                  }))
            }
            dispensers={dispensers.map((d) => ({ id: d.id, fuelType: d.fuelType }))}
          />
        </Suspense>
      </section>

      {/* Every block full width at every size, on screen as on paper: the bán nợ, thu chi
          and công nợ tables carry mã khách and amounts that need the room. */}
      <div className="space-y-6">
        <div className="min-w-0 space-y-6">
          <ShiftDebtSales stationCode={code} rows={debtSaleRows} pendingCount={pendingDebtVisits} />
          <div id="thu-chi" className="scroll-mt-28">
            <CashEntriesTable
              shiftId={shift.id}
              initialEntries={cashEntries}
              customers={cashCustomers}
              canEdit={canEditCashEntries(user.role)}
            />
          </div>
        </div>
        <div className="min-w-0 space-y-6">
          <section id="cong-no" className="scroll-mt-28 space-y-2">
            <SectionHeading
              title={vi.shifts.debtLedger.title}
              href={`${stationHref(code)}/debts?date=${shiftDay}`}
              linkLabel={vi.shifts.debtLedger.openTab}
            />
            <Suspense fallback={<SectionLoading label={vi.shifts.debtLedger.loading} />}>
              <ShiftDebtLedger stationId={shift.stationId} stationCode={code} day={shiftDay} />
            </Suspense>
          </section>
          <div id="ton-tien-mat" className="scroll-mt-28">
            <CashBalanceCard
              stationId={shift.stationId}
              line={cashBalance.kind === 'line' ? cashBalance.line : null}
              message={
                cashBalance.kind === 'no-opening'
                  ? vi.shifts.cashBalance.noOpening
                  : cashBalance.kind === 'before-opening'
                    ? vi.shifts.cashBalance.beforeOpening(formatDate(cashBalance.effectiveDate))
                    : null
              }
              openingLabel={
                cashBalance.kind === 'line'
                  ? vi.shifts.cashBalance.openingFrom(
                      formatVND(cashBalance.opening.amount),
                      formatDate(cashBalance.opening.effectiveDate)
                    )
                  : null
              }
              provisional={!completed}
              isAdmin={user.role === 'admin'}
              defaultDate={shiftDay}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
