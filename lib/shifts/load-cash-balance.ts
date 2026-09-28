import { chargeAmountOf } from '@/lib/debts/visit-amount'
import { type FuelArea } from '@/lib/generated/prisma/client'
import { priceRowOnDate } from '@/lib/misa-export/build-sales-voucher'
import { APPROVED_VISIT_STATUSES, shiftDayWindow } from '@/lib/misa-export/debts-list'
import { shiftDateFor } from '@/lib/photos/ingest'
import { prisma } from '@/lib/prisma'
import { type CashBalanceLine, type CashDay, chainCashBalances } from '@/lib/shifts/cash-balance'
import { readingAmount, readingMeters } from '@/lib/shifts/reading-totals'

export type CashBalanceView =
  | { kind: 'no-opening' }
  | { kind: 'before-opening'; effectiveDate: Date }
  | { kind: 'line'; line: CashBalanceLine; opening: { amount: number; effectiveDate: Date } }

const dec = (d: { toNumber: () => number } | null) => (d === null ? null : d.toNumber())
const dayKey = (d: Date) => d.toISOString().slice(0, 10)

/**
 * The Tồn tiền mặt of one ca: every ca of the trạm from its tiền mặt đầu kỳ up to this one
 * is summed on read — nothing stored — so an admin's edit to any earlier ca reflows it.
 * Per ca: Tổng tiền bán is the Tổng row of its trụ table (every số liệu, as the table
 * sums it), Tổng thu / chi its Thu chi table, Tổng nợ what its ngày's duyệt'd bán nợ
 * charge. Ca are chained oldest first; a ngày holding two ca counts its bán nợ once, on
 * the first of them.
 */
// ponytail: re-reads the trạm's whole history since đầu kỳ per view (one ca a day, so a few
// hundred rows a year); add a stored per-ca snapshot if that ever shows up in page time.
export async function loadCashBalance(shift: {
  id: string
  stationId: string
  shiftDate: Date
  fuelArea: FuelArea | null
}): Promise<CashBalanceView> {
  const opening = await prisma.cashOpeningBalance.findUnique({
    where: { stationId: shift.stationId },
  })
  if (!opening) return { kind: 'no-opening' }
  if (shift.shiftDate < opening.effectiveDate) {
    return { kind: 'before-opening', effectiveDate: opening.effectiveDate }
  }

  const shifts = await prisma.shift.findMany({
    where: {
      stationId: shift.stationId,
      shiftDate: { gte: opening.effectiveDate, lte: shift.shiftDate },
    },
    orderBy: [{ shiftDate: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, shiftDate: true },
  })
  const ids = shifts.map((s) => s.id)
  const [readings, cashEntries, visits, prices] = await Promise.all([
    prisma.shiftReading.findMany({
      where: { shiftId: { in: ids } },
      select: {
        shiftId: true,
        fuelType: true,
        openingElectronicReading: true,
        electronicReading: true,
        openingMechanicalReading: true,
        mechanicalReading: true,
        airPurgeLiters: true,
      },
    }),
    prisma.shiftCashEntry.findMany({
      where: { shiftId: { in: ids } },
      select: { shiftId: true, receipt: true, payment: true },
    }),
    prisma.debtVehicleVisit.findMany({
      where: {
        stationId: shift.stationId,
        reviewStatus: { in: APPROVED_VISIT_STATUSES },
        visitDate: {
          gte: shiftDayWindow(opening.effectiveDate).start,
          lt: shiftDayWindow(shift.shiftDate).end,
        },
      },
      select: { visitDate: true, litersRead: true, unitPriceRead: true, amountOverride: true },
    }),
    shift.fuelArea
      ? prisma.misaRetailPrice.findMany({
          where: { fuelArea: shift.fuelArea },
          orderBy: { effectiveDate: 'asc' },
        })
      : Promise.resolve([]),
  ])
  const priceBoard = prices.map((p) => ({
    fuelType: p.fuelType,
    effectiveDate: p.effectiveDate,
    unitPrice: p.unitPrice.toNumber(),
  }))

  const days = new Map<string, CashDay>(
    shifts.map((s) => [s.id, { shiftId: s.id, sales: 0, receipts: 0, payments: 0, debts: 0 }])
  )
  const dateOf = new Map(shifts.map((s) => [s.id, s.shiftDate]))
  for (const r of readings) {
    const date = dateOf.get(r.shiftId)!
    const price = priceRowOnDate(priceBoard, r.fuelType, date)?.unitPrice ?? null
    days.get(r.shiftId)!.sales += readingAmount(readingMeters(r), price, dec(r.airPurgeLiters)) ?? 0
  }
  for (const e of cashEntries) {
    const day = days.get(e.shiftId)!
    day.receipts += dec(e.receipt) ?? 0
    day.payments += dec(e.payment) ?? 0
  }
  const firstShiftOfDay = new Map<string, string>()
  for (const s of shifts) {
    if (!firstShiftOfDay.has(dayKey(s.shiftDate))) firstShiftOfDay.set(dayKey(s.shiftDate), s.id)
  }
  for (const v of visits) {
    const shiftId = firstShiftOfDay.get(dayKey(shiftDateFor(v.visitDate.getTime())))
    if (!shiftId) continue
    days.get(shiftId)!.debts +=
      chargeAmountOf({
        litersRead: dec(v.litersRead),
        unitPriceRead: dec(v.unitPriceRead),
        amountOverride: dec(v.amountOverride),
      }) ?? 0
  }

  const line = chainCashBalances(opening.amount.toNumber(), [...days.values()]).get(shift.id)
  return line
    ? {
        kind: 'line',
        line,
        opening: { amount: opening.amount.toNumber(), effectiveDate: opening.effectiveDate },
      }
    : { kind: 'no-opening' }
}
