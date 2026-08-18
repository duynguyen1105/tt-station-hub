// The Giá bán lẻ board: one entry per nhiên liệu, both vùng side by side, each cell
// carrying the price in force today. Pure — plain rows in, view model out — so the
// rules below are testable without React or Prisma.
//
// FuelArea is imported as a *type* only: the Thêm giá dialog pre-fills its cells with
// this module's in-force rule, and importing the Prisma enum's value would drag the
// Prisma runtime into the client bundle. The two vùng are listed here instead.
import type { FuelArea } from '../generated/prisma/client'
import { type RetailPrice, priceRowOnDate } from './build-sales-voucher'

// Business order xăng → dầu → phụ gia. The board is driven by this list, not by
// what happens to be in the database, so a fuel with no price still gets a row.
export const BOARD_FUEL_ORDER = ['XANG_A95', 'E0', 'DO', 'DC', 'URE'] as const

/** Both vùng, in the order the board columns and the Thêm giá grid show them. */
export const BOARD_AREA_ORDER = [
  'FUEL_AREA_1',
  'FUEL_AREA_2',
] as const satisfies readonly FuelArea[]

/**
 * Nhiên liệu whose giá bán lẻ carries no vùng. URE (Adblue) is a phụ gia sold at one
 * price nationally, so the board shows it once and a kỳ writes that one number into
 * both vùng — the rows on disk stay per-vùng, because every reader downstream still
 * filters by the trạm's own vùng and must find a row there.
 */
const AREA_INDEPENDENT_FUELS = new Set<string>(['URE'])

/** Whether this nhiên liệu is priced once for both vùng rather than per vùng. */
export function isAreaIndependent(fuelType: string): boolean {
  return AREA_INDEPENDENT_FUELS.has(fuelType)
}

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
  /** True when one price covers both vùng, so the board merges the entry's two cells. */
  areaIndependent: boolean
  cells: Record<FuelArea, BoardCell>
}

/**
 * The five-row view model behind Cài đặt MISA → Giá bán lẻ: every nhiên liệu in
 * business order, with the price in force on `today` for each vùng.
 */
export function buildRetailPriceBoard(prices: BoardPrice[], today: Date): BoardEntry[] {
  return BOARD_FUEL_ORDER.map((fuelType) => ({
    fuelType,
    areaIndependent: isAreaIndependent(fuelType),
    cells: {
      FUEL_AREA_1: buildCell(prices, 'FUEL_AREA_1', fuelType, today),
      FUEL_AREA_2: buildCell(prices, 'FUEL_AREA_2', fuelType, today),
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

/**
 * Every price ever recorded for one cell of the board — one nhiên liệu in one vùng, or
 * both vùng at once when the nhiên liệu is priced the same everywhere.
 */
function pricesForCell(prices: BoardPrice[], fuelArea: FuelArea, fuelType: string): BoardPrice[] {
  const ofFuel = prices.filter((p) => p.fuelType === fuelType)
  if (!isAreaIndependent(fuelType)) return ofFuel.filter((p) => p.fuelArea === fuelArea)

  // A kỳ writes this nhiên liệu into both vùng, so each ngày áp dụng holds two rows of
  // the same price. Collapse them onto the date — otherwise the Lịch sử would list every
  // date twice — keeping vùng 1 where both exist so the pick is deterministic.
  const byDate = new Map<number, BoardPrice>()
  for (const price of ofFuel) {
    const date = price.effectiveDate.getTime()
    if (!byDate.has(date) || price.fuelArea === BOARD_AREA_ORDER[0]) byDate.set(date, price)
  }
  return [...byDate.values()]
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

/** A giá bán lẻ row the kỳ planner can address, i.e. one already saved. */
export type ExistingPrice = BoardPrice & { id: string }

/**
 * One cell of the Thêm giá grid. A blank cell — a null `unitPrice` — means "nothing
 * changes"; a null `fuelArea` means the price covers both vùng, which is how a nhiên
 * liệu with no vùng separation is keyed once and stored twice.
 */
export type KyCell = { fuelArea: FuelArea | null; fuelType: string; unitPrice: number | null }

/** What the kỳ does to one cell. The ngày áp dụng is the kỳ's own, so it is not repeated. */
export type KyOperation =
  | { kind: 'create'; fuelArea: FuelArea; fuelType: string; unitPrice: number }
  | {
      kind: 'update'
      id: string
      fuelArea: FuelArea
      fuelType: string
      unitPrice: number
      previousUnitPrice: number
    }

/**
 * Resolves a submitted kỳ điều chỉnh giá into the rows to write: a blank cell does
 * nothing, a filled cell creates unless the kỳ date already carries that cell, in
 * which case it updates that row. A cell with no vùng resolves to one row per vùng,
 * so both carry the same price. The caller applies the whole plan or none of it.
 */
export function planKyPriceSave(
  existing: ExistingPrice[],
  effectiveDate: Date,
  cells: KyCell[]
): KyOperation[] {
  const plan: KyOperation[] = []
  for (const cell of cells) {
    if (cell.unitPrice === null) continue
    const unitPrice = cell.unitPrice
    const areas = cell.fuelArea === null ? BOARD_AREA_ORDER : [cell.fuelArea]
    for (const fuelArea of areas) {
      const onDate = existing.find(
        (p) =>
          p.fuelArea === fuelArea &&
          p.fuelType === cell.fuelType &&
          p.effectiveDate.getTime() === effectiveDate.getTime()
      )
      plan.push(
        onDate
          ? {
              kind: 'update',
              id: onDate.id,
              fuelArea,
              fuelType: cell.fuelType,
              unitPrice,
              previousUnitPrice: onDate.unitPrice,
            }
          : {
              kind: 'create',
              fuelArea,
              fuelType: cell.fuelType,
              unitPrice,
            }
      )
    }
  }
  return plan
}
