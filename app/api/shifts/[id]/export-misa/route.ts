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
  // shiftDate is stored as UTC-midnight labelled with the Vietnam (GMT+7) calendar day
  // (see shiftDateFor in lib/photos/ingest.ts), but visitDate is the raw UTC instant.
  // Shift the 24h window back 7h so it spans the Vietnam calendar day, not local 07:00→07:00.
  const VN_OFFSET_MS = 7 * 60 * 60 * 1000
  const dayStart = new Date(shiftDate.getTime() - VN_OFFSET_MS)
  const dayEnd = new Date(shiftDate.getTime() + 24 * 60 * 60 * 1000 - VN_OFFSET_MS)

  const [station, config, fuelMap, priceRows, readingRows, dispenserRows, visitRows] =
    await Promise.all([
      prisma.station.findUnique({ where: { id: stationId } }),
      prisma.misaStationConfig.findUnique({ where: { stationId } }),
      prisma.misaFuelMap.findMany({ where: { stationId } }),
      prisma.misaRetailPrice.findMany({
        where: { stationId },
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

  const dispenserById = new Map(dispenserRows.map((d) => [d.id, d]))

  // computeShiftSales (inside the builder) needs each dispenser's OPENING reading, but on a
  // completed shift the dispenser's lastElectronicReading has been advanced to the closing
  // reading. Reconstruct the opening per approved reading as closing − storedDelta.
  const saleReadings: SaleReading[] = readingRows.map((r) => ({
    dispenserId: r.dispenserId,
    electronicReading: num(r.electronicReading),
  }))
  const saleDispensers: SaleDispenser[] = readingRows.map((r) => {
    const closing = num(r.electronicReading)
    const delta = num(r.electronicDelta)
    return {
      id: r.dispenserId,
      fuelType: dispenserById.get(r.dispenserId)?.fuelType ?? '',
      lastElectronicReading: closing !== null && delta !== null ? closing - delta : null,
    }
  })

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
