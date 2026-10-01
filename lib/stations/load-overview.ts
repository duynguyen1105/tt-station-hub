import { countedTxs } from '@/lib/debts/ledger'
import { loadLedgers, todayKey } from '@/lib/debts/load-ledger'
import { daysUntil, documentStatus } from '@/lib/documents/expiry-checker'
import type { FuelArea } from '@/lib/generated/prisma/client'
import { bookSummary } from '@/lib/inventory/book-stock'
import { PENDING_DIP } from '@/lib/inventory/dip-review'
import { priceRowOnDate } from '@/lib/misa-export/build-sales-voucher'
import { PENDING_VISIT_STATUSES } from '@/lib/misa-export/debts-list'
import { prisma } from '@/lib/prisma'
import { type CashBalanceView, loadCashBalance } from '@/lib/shifts/load-cash-balance'
import { readingAmount, readingMeters, soldLiters } from '@/lib/shifts/reading-totals'
import {
  type SaleLine,
  type SalesTotal,
  addDays,
  daysOfCover,
  daysWithoutShift,
  monthStart,
  previousMonthToDate,
  salesBetween,
  sumSales,
} from '@/lib/stations/overview'

/** How many ngày the doanh thu chart and the ngày-chưa-có-ca check span, today included. */
export const CHART_DAYS = 30
/** The ngày before today the bán trung bình behind "đủ bán ~N ngày" averages over. */
const RATE_DAYS = 7
/** A nhiên liệu lasting fewer ngày than this is flagged to be ordered. */
export const LOW_COVER_DAYS = 3
/** Ca listed under Ca gần đây. */
const RECENT_SHIFTS = 7

const dec = (d: { toNumber: () => number } | null) => (d === null ? null : d.toNumber())
const dayOf = (d: Date) => d.toISOString().slice(0, 10)

export type OverviewShift = {
  day: string
  status: string
  /** Null for a hủy ca, and for one older than the ngày whose số liệu were read. */
  sales: SalesTotal | null
}

export type OverviewStock = {
  fuelType: string
  /** Tồn sổ sách: đầu kỳ + nhập − xuất ± điều chỉnh, as the Hàng tồn tab books it. */
  bookStock: number
  /** False while the nhiên liệu has no số đầu kỳ, so its sổ counts from zero. */
  hasOpening: boolean
  /** Σ dung tích of its hầm in litres; null when any hầm's is không rõ. */
  capacity: number | null
  lowThreshold: number | null
  /** Litres a ngày over the RATE_DAYS ngày before today that had a ca. */
  dailyRate: number
  cover: number | null
  lastImport: { at: Date; liters: number } | null
}

export type OverviewDocument = { name: string; expiry: Date; daysLeft: number }

export type OverviewDebtor = { no: number | null; name: string; balance: number }

export type OverviewReceipt = {
  no: number
  date: Date
  lines: { fuelType: string; liters: number }[]
}

export type StationOverview = {
  /** The ngày of the trạm's first ca; null before it has any. */
  firstDay: string | null
  pending: { readings: number; visits: number; dips: number }
  /** Ngày before today whose ca is neither chốt nor hủy, oldest first. */
  unclosedShifts: string[]
  /** Ngày in the last CHART_DAYS (since the trạm's first ca, before today) with no ca. */
  missingDays: string[]
  documents: { total: number; attention: OverviewDocument[] }
  sales: {
    /** One entry per ngày of the chart, oldest first; null for a ngày with no ca. */
    chart: { day: string; total: SalesTotal | null }[]
    week: SalesTotal
    previousWeek: SalesTotal
    month: SalesTotal
    previousMonth: SalesTotal
    /** Giá bán lẻ in force today, per nhiên liệu. */
    priceToday: Map<string, number>
  }
  latestShift: OverviewShift | null
  recentShifts: OverviewShift[]
  cash: { day: string; view: CashBalanceView } | null
  stock: OverviewStock[]
  debt: {
    total: number
    owingCount: number
    top: OverviewDebtor[]
    month: { charged: number; advanced: number; paid: number }
  }
  receipts: OverviewReceipt[]
}

/**
 * Everything the Tổng quan tab shows for one trạm, read in one pass. Each figure is the one
 * its own tab prints — Tổng tiền priced as the phiếu chốt ca prices it, tồn sổ sách booked
 * as Hàng tồn books it, dư nợ summed as the sổ công nợ sums it — so the overview never
 * disagrees with the page it links to.
 */
export async function loadStationOverview(station: {
  id: string
  fuelArea: FuelArea
}): Promise<StationOverview> {
  const stationId = station.id
  const today = todayKey()
  const todayDate = new Date(`${today}T00:00:00.000Z`)
  const chartFrom = addDays(today, -(CHART_DAYS - 1))
  const previousMonth = previousMonthToDate(today)
  const monthFrom = monthStart(today)
  // The ngày whose số liệu are read: the chart's, the two weeks' and both months'.
  const windowFrom = previousMonth.from < chartFrom ? previousMonth.from : chartFrom

  const [
    shifts,
    pendingVisits,
    pendingDips,
    documents,
    tanks,
    openings,
    balances,
    movements,
    prices,
    lastImports,
    receiptRows,
    ledgers,
  ] = await Promise.all([
    // One ca a ngày, so the whole list is a few hundred rows a year.
    prisma.shift.findMany({
      where: { stationId },
      orderBy: [{ shiftDate: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, shiftDate: true, status: true },
    }),
    prisma.debtVehicleVisit.count({
      where: { stationId, reviewStatus: { in: PENDING_VISIT_STATUSES } },
    }),
    prisma.tankDipRecord.count({ where: { stationId, reviewStatus: PENDING_DIP } }),
    prisma.stationDocument.findMany({
      where: { stationId },
      select: { docName: true, expiryDate: true },
    }),
    prisma.tank.findMany({ where: { stationId }, select: { fuelType: true, capacityK: true } }),
    prisma.inventoryOpeningBalance.findMany({ where: { stationId } }),
    prisma.inventoryBalance.findMany({
      where: { stationId },
      select: { fuelType: true, lowThreshold: true },
    }),
    // ponytail: the whole movement history, as the Hàng tồn tab reads it; a SQL SUM per
    // nhiên liệu if one trạm's sổ ever reaches tens of thousands of rows.
    prisma.inventoryMovement.findMany({
      where: { stationId },
      select: { fuelType: true, movementType: true, quantity: true, movementDate: true },
    }),
    prisma.misaRetailPrice.findMany({
      where: { fuelArea: station.fuelArea },
      select: { fuelType: true, effectiveDate: true, unitPrice: true },
    }),
    prisma.fuelImport.findMany({
      where: { stationId, canceledAt: null },
      orderBy: { importedAt: 'desc' },
      distinct: ['fuelType'],
      select: { fuelType: true, importedAt: true, litersActual: true },
    }),
    prisma.fuelImportReceipt.findMany({
      where: { stationId },
      orderBy: [{ receiptDate: 'desc' }, { no: 'desc' }],
      take: 5,
      select: { id: true, no: true, receiptDate: true },
    }),
    loadLedgers({ stationId, isActive: true }),
  ])

  const liveShifts = shifts.filter((s) => s.status !== 'cancelled')
  const windowShifts = liveShifts.filter((s) => dayOf(s.shiftDate) >= windowFrom)
  const latestLive = liveShifts[0] ?? null
  const [readings, pendingReadings, receiptImports, cashView] = await Promise.all([
    prisma.shiftReading.findMany({
      where: { shiftId: { in: windowShifts.map((s) => s.id) } },
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
    prisma.shiftReading.count({
      where: {
        shiftId: { in: shifts.map((s) => s.id) },
        reviewStatus: { in: ['pending', 'needs_review'] },
      },
    }),
    prisma.fuelImport.findMany({
      where: { receiptId: { in: receiptRows.map((r) => r.id) }, canceledAt: null },
      select: { receiptId: true, fuelType: true, litersActual: true },
    }),
    latestLive
      ? loadCashBalance({ ...latestLive, stationId, fuelArea: station.fuelArea })
      : Promise.resolve(null),
  ])

  // --- Bán hàng: every trụ of every ca not hủy, priced at its ngày's giá bán lẻ ---
  const priceBoard = prices.map((p) => ({
    fuelType: p.fuelType,
    effectiveDate: p.effectiveDate,
    unitPrice: p.unitPrice.toNumber(),
  }))
  const dateOfShift = new Map(windowShifts.map((s) => [s.id, s.shiftDate]))
  const linesByShift = new Map<string, SaleLine[]>()
  for (const r of readings) {
    const shiftDate = dateOfShift.get(r.shiftId)!
    const meters = readingMeters(r)
    const air = dec(r.airPurgeLiters)
    const liters = soldLiters(meters, air)
    // A trụ with no closing yet has sold nothing anyone can count.
    if (liters === null) continue
    const price = priceRowOnDate(priceBoard, r.fuelType, shiftDate)?.unitPrice ?? null
    const list = linesByShift.get(r.shiftId) ?? []
    list.push({
      day: dayOf(shiftDate),
      fuelType: r.fuelType,
      liters,
      amount: readingAmount(meters, price, air),
    })
    linesByShift.set(r.shiftId, list)
  }
  const lines = [...linesByShift.values()].flat()
  const liveDays = new Set(liveShifts.map((s) => dayOf(s.shiftDate)))
  const chart = Array.from({ length: CHART_DAYS }, (_, i) => {
    const day = addDays(chartFrom, i)
    return { day, total: liveDays.has(day) ? salesBetween(lines, day, day) : null }
  })
  const priceToday = new Map<string, number>()
  for (const fuelType of new Set(priceBoard.map((p) => p.fuelType))) {
    const row = priceRowOnDate(priceBoard, fuelType, todayDate)
    if (row) priceToday.set(fuelType, row.unitPrice)
  }

  const shiftView = (s: (typeof shifts)[number]): OverviewShift => ({
    day: dayOf(s.shiftDate),
    status: s.status,
    sales:
      s.status !== 'cancelled' && dateOfShift.has(s.id)
        ? sumSales(linesByShift.get(s.id) ?? [])
        : null,
  })

  // --- Việc tồn: ca chưa chốt, ngày chưa có ca, giấy tờ ---
  const unclosedShifts = shifts
    .filter(
      (s) => s.status !== 'completed' && s.status !== 'cancelled' && dayOf(s.shiftDate) < today
    )
    .map((s) => dayOf(s.shiftDate))
    .reverse()
  // Counted from the trạm's first ca: the ngày before it began using the app are not gaps.
  // Today is left out — its ca opens with the first ảnh, which may simply not be in yet.
  const first = shifts.at(-1)
  const firstDay = first ? dayOf(first.shiftDate) : null
  const missingDays =
    firstDay === null
      ? []
      : daysWithoutShift(
          new Set(shifts.map((s) => dayOf(s.shiftDate))),
          firstDay > chartFrom ? firstDay : chartFrom,
          addDays(today, -1)
        )

  const now = new Date()
  const attentionDocs = documents
    .flatMap((d) =>
      d.expiryDate && documentStatus(d.expiryDate, now) !== 'valid'
        ? [{ name: d.docName, expiry: d.expiryDate, daysLeft: daysUntil(d.expiryDate, now) }]
        : []
    )
    .sort((a, b) => a.daysLeft - b.daysLeft)

  // --- Tồn kho: the sổ sách per nhiên liệu, and how long it lasts at the recent pace ---
  const openingByFuel = new Map(openings.map((o) => [o.fuelType, o]))
  const thresholdByFuel = new Map(balances.map((b) => [b.fuelType, dec(b.lowThreshold)]))
  const lastImportByFuel = new Map(lastImports.map((i) => [i.fuelType, i]))
  const capacityByFuel = new Map<string, number | null>()
  for (const t of tanks) {
    const sum = capacityByFuel.has(t.fuelType) ? capacityByFuel.get(t.fuelType)! : 0
    capacityByFuel.set(
      t.fuelType,
      sum === null || t.capacityK === null ? null : sum + t.capacityK * 1000
    )
  }
  // The ngày before today only: today's ca is usually still open and would drag the pace down.
  const rateFrom = addDays(today, -RATE_DAYS)
  const rateTo = addDays(today, -1)
  const rateDays = [...liveDays].filter((d) => d >= rateFrom && d <= rateTo).length
  const rateSales = salesBetween(lines, rateFrom, rateTo)
  const stockFuels = [
    ...new Set([...tanks.map((t) => t.fuelType), ...openings.map((o) => o.fuelType)]),
  ].sort()
  const stock = stockFuels.map((fuelType): OverviewStock => {
    const opening = openingByFuel.get(fuelType)
    const { bookStock } = bookSummary(
      opening ? opening.openingLiters.toNumber() : 0,
      opening?.effectiveDate ?? new Date(0),
      movements
        .filter((m) => m.fuelType === fuelType)
        .map((m) => ({
          movementType: m.movementType,
          quantity: m.quantity.toNumber(),
          movementDate: m.movementDate,
        }))
    )
    const dailyRate = rateDays ? (rateSales.byFuel.get(fuelType)?.liters ?? 0) / rateDays : 0
    const lastImport = lastImportByFuel.get(fuelType)
    return {
      fuelType,
      bookStock,
      hasOpening: opening !== undefined,
      capacity: capacityByFuel.get(fuelType) ?? null,
      lowThreshold: thresholdByFuel.get(fuelType) ?? null,
      dailyRate,
      cover: daysOfCover(bookStock, dailyRate),
      lastImport: lastImport
        ? { at: lastImport.importedAt, liters: lastImport.litersActual.toNumber() }
        : null,
    }
  })

  // --- Công nợ: dư nợ now, and what this month added and settled ---
  const debtMonth = { charged: 0, advanced: 0, paid: 0 }
  const debtors: OverviewDebtor[] = []
  for (const { customer, txs } of ledgers) {
    let balance = customer.anchor.openingBalance
    for (const tx of countedTxs(customer.anchor, txs)) {
      balance += tx.txType === 'charge' ? tx.amount : -tx.amount
      if (tx.txDate < monthFrom || tx.txDate > today) continue
      if (tx.txType === 'payment') debtMonth.paid += tx.amount
      else if (tx.advance) debtMonth.advanced += tx.amount
      else debtMonth.charged += tx.amount
    }
    debtors.push({ no: customer.no, name: customer.name, balance })
  }
  const owing = debtors.filter((d) => d.balance > 0).sort((a, b) => b.balance - a.balance)

  // --- Nhập hàng gần đây: each biên bản with the litres it booked per nhiên liệu ---
  const receipts = receiptRows.map((r) => {
    const byFuel = new Map<string, number>()
    for (const i of receiptImports) {
      if (i.receiptId !== r.id) continue
      byFuel.set(i.fuelType, (byFuel.get(i.fuelType) ?? 0) + i.litersActual.toNumber())
    }
    return {
      no: r.no,
      date: r.receiptDate,
      lines: [...byFuel].map(([fuelType, liters]) => ({ fuelType, liters })),
    }
  })

  return {
    firstDay,
    pending: { readings: pendingReadings, visits: pendingVisits, dips: pendingDips },
    unclosedShifts,
    missingDays,
    documents: { total: documents.length, attention: attentionDocs },
    sales: {
      chart,
      week: salesBetween(lines, addDays(today, -6), today),
      previousWeek: salesBetween(lines, addDays(today, -13), addDays(today, -7)),
      month: salesBetween(lines, monthFrom, today),
      previousMonth: salesBetween(lines, previousMonth.from, previousMonth.to),
      priceToday,
    },
    latestShift: latestLive ? shiftView(latestLive) : null,
    recentShifts: shifts.slice(0, RECENT_SHIFTS).map(shiftView),
    cash: latestLive && cashView ? { day: dayOf(latestLive.shiftDate), view: cashView } : null,
    stock,
    debt: {
      total: debtors.reduce((sum, d) => sum + d.balance, 0),
      owingCount: owing.length,
      top: owing.slice(0, 5),
      month: debtMonth,
    },
    receipts,
  }
}
