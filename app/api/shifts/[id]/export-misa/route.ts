import { NextResponse } from 'next/server'

import { notFound, unauthorized } from '@/lib/api/response'
import { getCurrentUser } from '@/lib/auth/session'
import {
  type CreditCustomer,
  type CreditVisit,
  type FuelMapEntry,
  type RetailPrice,
  type SaleDispenser,
  type SaleReading,
  type StationConfig,
  buildMisaSalesVoucher,
} from '@/lib/misa-export/build-sales-voucher'
import { shiftDayWindow } from '@/lib/misa-export/debts-list'
import { misaRowsToXlsxBuffer } from '@/lib/misa-export/shift-to-excel'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

const APPROVED_READING_STATUSES = ['approved', 'auto_approved', 'corrected']
const APPROVED_VISIT_STATUSES = ['approved', 'corrected']

const num = (d: { toNumber: () => number } | null): number | null =>
  d === null ? null : d.toNumber()

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params
  const searchParams = new URL(req.url).searchParams
  const preflight = searchParams.get('preflight') === '1'
  const confirmed = searchParams.get('confirm') === '1'
  // Accountant-set voucher dates (yyyy-MM-dd) for H/I/N; undefined → builder uses the sale date.
  const parseDate = (s: string | null): Date | undefined => {
    if (!s) return undefined
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? undefined : d
  }
  const postingDate = parseDate(searchParams.get('postingDate'))
  const voucherDate = parseDate(searchParams.get('voucherDate'))
  const invoiceDate = parseDate(searchParams.get('invoiceDate'))

  const shift = await prisma.shift.findUnique({ where: { id } })
  if (!shift) return notFound()

  const { stationId, shiftDate } = shift
  // The ca's Vietnam-offset calendar-day window (see lib/misa-export/debts-list):
  // shiftDate is UTC-midnight labelled with the Vietnam (GMT+7) day, visitDate is the
  // raw UTC instant, so the helper shifts the 24h window back 7h to span the VN day.
  const { start: dayStart, end: dayEnd } = shiftDayWindow(shiftDate)

  // Prices are keyed by the station's Vùng (retail zone), so resolve the station first.
  const station = await prisma.station.findUnique({ where: { id: stationId } })
  if (!station) return notFound()

  const [config, fuelMap, priceRows, readingRows, dispenserRows, visitRows] = await Promise.all([
    prisma.misaGlobalConfig.findUnique({ where: { id: 'default' } }),
    prisma.misaFuelMap.findMany({ where: { stationId } }),
    prisma.misaRetailPrice.findMany({
      where: { vung: station.vung },
      orderBy: { effectiveDate: 'asc' },
    }),
    prisma.shiftReading.findMany({
      where: { shiftId: id, reviewStatus: { in: APPROVED_READING_STATUSES } },
      orderBy: { dispenserId: 'asc' },
    }),
    prisma.dispenser.findMany({ where: { stationId } }),
    prisma.debtVehicleVisit.findMany({
      where: {
        stationId,
        reviewStatus: { in: APPROVED_VISIT_STATUSES },
        visitDate: { gte: dayStart, lt: dayEnd },
      },
      orderBy: [{ visitDate: 'asc' }, { id: 'asc' }],
    }),
  ])

  const customerIds = [
    ...new Set(visitRows.map((v) => v.customerId).filter((cid): cid is string => cid !== null)),
  ]
  const customerRows =
    customerIds.length > 0
      ? await prisma.debtCustomer.findMany({ where: { id: { in: customerIds } } })
      : []

  // Each reading carries its own opening, so metered liters are the reading's
  // closing minus that opening; the dispenser contributes only its fuel type.
  const saleReadings: SaleReading[] = readingRows.map((r) => ({
    dispenserId: r.dispenserId,
    openingElectronicReading: num(r.openingElectronicReading),
    electronicReading: num(r.electronicReading),
  }))
  const saleDispensers: SaleDispenser[] = dispenserRows.map((d) => ({
    id: d.id,
    fuelType: d.fuelType,
  }))

  const stationConfig: StationConfig | null =
    config === null
      ? null
      : {
          revenueAccount: config.revenueAccount,
          costAccount: config.costAccount,
          stockAccount: config.stockAccount,
          creditDebitAccount: config.creditDebitAccount,
          cashDebitAccount: config.cashDebitAccount,
        }

  const fuelMapEntries: FuelMapEntry[] = fuelMap.map((f) => ({
    fuelType: f.fuelType,
    productCode: f.productCode,
    productName: f.productName ?? '',
    warehouseCode: f.warehouseCode,
  }))

  const prices: RetailPrice[] = priceRows.map((p) => ({
    fuelType: p.fuelType,
    effectiveDate: p.effectiveDate,
    unitPrice: p.unitPrice.toNumber(),
  }))

  const creditVisits: CreditVisit[] = visitRows.map((v) => ({
    id: v.id,
    customerId: v.customerId,
    fuelType: v.fuelType,
    litersRead: num(v.litersRead),
    unitPriceRead: num(v.unitPriceRead),
    computedAmount: num(v.computedAmount),
    plate: v.plateConfirmed ?? v.plateRead,
  }))

  const customers: CreditCustomer[] = customerRows.map((c) => ({
    id: c.id,
    name: c.name,
    misaCode: c.misaCode,
  }))

  const result = buildMisaSalesVoucher({
    saleDate: shiftDate,
    postingDate,
    voucherDate,
    invoiceDate,
    stationConfig,
    fuelMap: fuelMapEntries,
    prices,
    readings: saleReadings,
    dispensers: saleDispensers,
    creditVisits,
    customers,
  })

  // Preflight mode → per-fuel math + fix-list + warnings as JSON, no file generated.
  if (preflight) {
    return NextResponse.json({
      stationId,
      fuelSummary: result.fuelSummary,
      errors: result.errors,
      warnings: result.warnings,
    })
  }

  // Blocking preflight errors → JSON fix-list, not a bad file.
  if (result.errors.length > 0) {
    return NextResponse.json({ errors: result.errors, warnings: result.warnings }, { status: 422 })
  }

  // Negative-cash (and any other) warnings require an explicit confirm; the direct
  // download link can't bypass it. 409 = blocked pending confirm.
  if (result.warnings.length > 0 && !confirmed) {
    return NextResponse.json({ errors: [], warnings: result.warnings }, { status: 409 })
  }

  const buffer = await misaRowsToXlsxBuffer(result.rows)
  const dateStr = shiftDate.toISOString().slice(0, 10)
  const filename = `misa-${station?.code ?? stationId}-${dateStr}.xlsx`
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
