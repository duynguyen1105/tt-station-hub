// The Giá bán lẻ board: one entry per nhiên liệu, both vùng side by side, each cell
// carrying the price in force today. Pure — plain rows in, view model out — so the
// rules below are testable without React or Prisma.
import { FuelArea } from '../generated/prisma/client'
import { type RetailPrice, priceRowOnDate } from './build-sales-voucher'

// Business order xăng → dầu → phụ gia. The board is driven by this list, not by
// what happens to be in the database, so a fuel with no price still gets a row.
const BOARD_FUEL_ORDER = ['XANG_A95', 'E0', 'DO', 'DC', 'URE'] as const

/** A giá bán lẻ row as the board receives it (Prisma's Decimal already a number). */
export type BoardPrice = RetailPrice & { fuelArea: FuelArea }

/** A price and the ngày áp dụng it starts on. */
export type BoardPriceAt = { unitPrice: number; effectiveDate: Date }

export type BoardCell = {
  /** The price in force today, or null → Chưa có giá. */
  current: BoardPriceAt | null
  /** The next kỳ already keyed in for a future date, shown muted beneath the current one. */
  pending: BoardPriceAt | null
}

export type BoardEntry = {
  fuelType: string
  cells: Record<FuelArea, BoardCell>
}

/**
 * The five-row view model behind Cài đặt MISA → Giá bán lẻ: every nhiên liệu in
 * business order, with the price in force on `today` for each vùng.
 */
export function buildRetailPriceBoard(prices: BoardPrice[], today: Date): BoardEntry[] {
  return BOARD_FUEL_ORDER.map((fuelType) => ({
    fuelType,
    cells: {
      [FuelArea.FUEL_AREA_1]: buildCell(prices, FuelArea.FUEL_AREA_1, fuelType, today),
      [FuelArea.FUEL_AREA_2]: buildCell(prices, FuelArea.FUEL_AREA_2, fuelType, today),
    },
  }))
}

function buildCell(
  prices: BoardPrice[],
  fuelArea: FuelArea,
  fuelType: string,
  today: Date
): BoardCell {
  const inArea = pricesForCell(prices, fuelArea, fuelType)
  const current = priceRowOnDate(inArea, fuelType, today)
  // The next kỳ to take effect — the earliest ngày áp dụng still ahead of today.
  const pending = inArea
    .filter((p) => p.effectiveDate.getTime() > today.getTime())
    .sort((a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime())[0]
  return { current: priceAt(current), pending: priceAt(pending) }
}

function priceAt(price: RetailPrice | null | undefined): BoardPriceAt | null {
  return price ? { unitPrice: price.unitPrice, effectiveDate: price.effectiveDate } : null
}

/** Every price ever recorded for one cell of the board — one nhiên liệu in one vùng. */
function pricesForCell(prices: BoardPrice[], fuelArea: FuelArea, fuelType: string): BoardPrice[] {
  return prices.filter((p) => p.fuelArea === fuelArea && p.fuelType === fuelType)
}

/** A row of a cell's Lịch sử, with whether it is the price the board calls current. */
export type TimelineRow = BoardPriceAt & { isCurrent: boolean }

/**
 * The Lịch sử behind one board cell: every giá bán lẻ ever recorded for that nhiên
 * liệu in that vùng, newest ngày áp dụng first. The row marked current is the one
 * `buildRetailPriceBoard` shows in the cell, so the timeline and the board agree.
 */
export function buildPriceTimeline(
  prices: BoardPrice[],
  fuelArea: FuelArea,
  fuelType: string,
  today: Date
): TimelineRow[] {
  const inCell = pricesForCell(prices, fuelArea, fuelType)
  const current = priceRowOnDate(inCell, fuelType, today)
  // priceRowOnDate returns a row out of inCell, so identity marks the very row the
  // board's cell is showing rather than one that merely looks like it.
  return inCell
    .sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime())
    .map((p) => ({
      unitPrice: p.unitPrice,
      effectiveDate: p.effectiveDate,
      isCurrent: p === current,
    }))
}
