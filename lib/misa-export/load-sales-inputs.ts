import type { FuelArea } from '@/lib/generated/prisma/client'
import type { CashVoucherEntry } from '@/lib/misa-export/build-cash-vouchers'
import type { MisaBuildInput, StationConfig } from '@/lib/misa-export/build-sales-voucher'
import {
  APPROVED_VISIT_STATUSES,
  isVisitOfShiftDay,
  photoInvoiceDate,
  shiftDayWindow,
} from '@/lib/misa-export/debts-list'
import { prisma } from '@/lib/prisma'

const APPROVED_READING_STATUSES = ['approved', 'auto_approved', 'corrected']

const num = (d: { toNumber: () => number } | null): number | null =>
  d === null ? null : d.toNumber()

/** What a ca's MISA sales voucher is built from, before kế toán's own dates. */
export type LoadedSalesInput = {
  input: Omit<MisaBuildInput, 'postingDate' | 'voucherDate' | 'invoiceDate'>
  /** The ngày on the ca's bán nợ photos — the default Ngày hóa đơn — or null. */
  photoDate: Date | null
}

/**
 * Everything `buildMisaSalesVoucher` needs for each of these ca, keyed by ca id — the one
 * read behind both Xuất MISA (one ca) and Xuất MISA theo kỳ (every ca of a khoảng), so
 * the two can never build a ca differently. One query per table however many ca there are.
 *
 * `stations` must hold each ca's trạm: prices are keyed by its fuel area. A ca whose trạm
 * is missing is left out of the map.
 */
export async function loadMisaSalesInputs(
  shifts: { id: string; stationId: string; shiftDate: Date }[],
  stations: { id: string; fuelArea: FuelArea }[]
): Promise<Map<string, LoadedSalesInput>> {
  const loaded = new Map<string, LoadedSalesInput>()
  if (shifts.length === 0) return loaded

  const stationById = new Map(stations.map((s) => [s.id, s]))
  const stationIds = [...new Set(shifts.map((s) => s.stationId))]
  const fuelAreas = [...new Set(stations.map((s) => s.fuelArea))]
  // The lượt bán nợ of every ca lie between the first ca's ngày window and the last one's;
  // each is handed to its own ca below by the same rule debtVisitSelection queries with.
  const times = shifts.map((s) => s.shiftDate.getTime())
  const visitStart = shiftDayWindow(new Date(Math.min(...times))).start
  const visitEnd = shiftDayWindow(new Date(Math.max(...times))).end

  const [config, fuelMapRows, priceRows, readingRows, dispenserRows, visitRows] = await Promise.all(
    [
      prisma.misaGlobalConfig.findUnique({ where: { id: 'default' } }),
      prisma.misaFuelMap.findMany({ where: { stationId: { in: stationIds } } }),
      prisma.misaRetailPrice.findMany({
        where: { fuelArea: { in: fuelAreas } },
        orderBy: { effectiveDate: 'asc' },
      }),
      prisma.shiftReading.findMany({
        where: {
          shiftId: { in: shifts.map((s) => s.id) },
          reviewStatus: { in: APPROVED_READING_STATUSES },
        },
        orderBy: { dispenserId: 'asc' },
      }),
      prisma.dispenser.findMany({ where: { stationId: { in: stationIds } } }),
      prisma.debtVehicleVisit.findMany({
        where: {
          stationId: { in: stationIds },
          reviewStatus: { in: APPROVED_VISIT_STATUSES },
          visitDate: { gte: visitStart, lt: visitEnd },
        },
        orderBy: [{ visitDate: 'asc' }, { id: 'asc' }],
      }),
    ]
  )

  const customerIds = [
    ...new Set(visitRows.map((v) => v.customerId).filter((cid): cid is string => cid !== null)),
  ]
  const customerRows =
    customerIds.length > 0
      ? await prisma.debtCustomer.findMany({ where: { id: { in: customerIds } } })
      : []
  const customers = customerRows.map((c) => ({ id: c.id, name: c.name, misaCode: c.misaCode }))

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

  for (const shift of shifts) {
    const station = stationById.get(shift.stationId)
    if (!station) continue
    const visits = visitRows.filter((v) => isVisitOfShiftDay(shift, v))
    loaded.set(shift.id, {
      input: {
        saleDate: shift.shiftDate,
        stationConfig,
        fuelMap: fuelMapRows
          .filter((f) => f.stationId === shift.stationId)
          .map((f) => ({
            fuelType: f.fuelType,
            productCode: f.productCode,
            productName: f.productName ?? '',
            warehouseCode: f.warehouseCode,
          })),
        prices: priceRows
          .filter((p) => p.fuelArea === station.fuelArea)
          .map((p) => ({
            fuelType: p.fuelType,
            effectiveDate: p.effectiveDate,
            unitPrice: p.unitPrice.toNumber(),
          })),
        // Each reading carries its own opening, the nhiên liệu it was recorded against and
        // its own Xả gió, so the liters sold are the reading's closing minus that opening
        // less that purge, and they price as the ca sold — a trụ converted since then does
        // not move them.
        readings: readingRows
          .filter((r) => r.shiftId === shift.id)
          .map((r) => ({
            dispenserId: r.dispenserId,
            fuelType: r.fuelType,
            openingElectronicReading: num(r.openingElectronicReading),
            electronicReading: num(r.electronicReading),
            airPurgeLiters: num(r.airPurgeLiters),
          })),
        dispensers: dispenserRows
          .filter((d) => d.stationId === shift.stationId)
          .map((d) => ({ id: d.id, fuelType: d.fuelType })),
        creditVisits: visits.map((v) => ({
          id: v.id,
          customerId: v.customerId,
          fuelType: v.fuelType,
          litersRead: num(v.litersRead),
          unitPriceRead: num(v.unitPriceRead),
          computedAmount: num(v.computedAmount),
          amountOverride: num(v.amountOverride),
          unitPriceEdited: v.originalUnitPriceRead !== null,
          plate: v.plateConfirmed ?? v.plateRead,
        })),
        customers,
      },
      photoDate: photoInvoiceDate(visits),
    })
  }
  return loaded
}

/** Each ca's Thu chi tiền mặt – Khách CK rows, in the table's order, keyed by ca id. */
export async function loadCashVoucherEntries(
  shiftIds: string[]
): Promise<Map<string, CashVoucherEntry[]>> {
  const rows = await prisma.shiftCashEntry.findMany({
    where: { shiftId: { in: shiftIds } },
    orderBy: { position: 'asc' },
  })
  const entries = new Map<string, CashVoucherEntry[]>(shiftIds.map((id) => [id, []]))
  for (const e of rows) {
    entries.get(e.shiftId)?.push({
      content: e.content,
      receipt: num(e.receipt),
      payment: num(e.payment),
      transfer: num(e.transfer),
    })
  }
  return entries
}
