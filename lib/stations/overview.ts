// The Tổng quan tab's arithmetic: days, periods and totals over a trạm's ca. Pure — plain
// rows in, plain numbers out — so it is testable without Prisma;
// lib/stations/load-overview.ts reads the rows. Every day is a YYYY-MM-DD GMT+7 ngày, the
// label a ca's shiftDate carries.

const DAY_MS = 24 * 60 * 60 * 1000

/** The ngày `n` days after `day` (before it, for a negative `n`). */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + n * DAY_MS).toISOString().slice(0, 10)
}

/** Every ngày from `from` to `to`, both included; empty when `from` is after `to`. */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = []
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day)
  return days
}

/** The first ngày of `day`'s month. */
export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`
}

/**
 * The same stretch of the previous month as `monthStart(day)`..`day`: from its 1st to the
 * same day of the month, cut at the month's last day (31/03 compares with 01/02–28/02).
 */
export function previousMonthToDate(day: string): { from: string; to: string } {
  const year = Number(day.slice(0, 4))
  const month = Number(day.slice(5, 7))
  const dom = Number(day.slice(8, 10))
  const from = new Date(Date.UTC(year, month - 2, 1))
  const lastDay = new Date(Date.UTC(year, month - 1, 0)).getUTCDate()
  const to = new Date(Date.UTC(year, month - 2, Math.min(dom, lastDay)))
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

/** One trụ's ca as Tổng quan counts it: the litres sold and what they are worth. */
export type SaleLine = {
  day: string
  fuelType: string
  liters: number
  /** Null where the ngày has no giá bán lẻ for the nhiên liệu. */
  amount: number | null
}

export type FuelSales = { liters: number; amount: number }

export type SalesTotal = {
  liters: number
  amount: number
  /** Litres sold with no giá bán lẻ in force — they are in `liters` but not in `amount`. */
  unpricedLiters: number
  byFuel: Map<string, FuelSales>
}

/** The lines summed into one total. */
export function sumSales(lines: readonly SaleLine[]): SalesTotal {
  const total: SalesTotal = { liters: 0, amount: 0, unpricedLiters: 0, byFuel: new Map() }
  for (const line of lines) {
    total.liters += line.liters
    if (line.amount === null) total.unpricedLiters += line.liters
    else total.amount += line.amount
    const fuel = total.byFuel.get(line.fuelType) ?? { liters: 0, amount: 0 }
    fuel.liters += line.liters
    fuel.amount += line.amount ?? 0
    total.byFuel.set(line.fuelType, fuel)
  }
  return total
}

/** The lines dated `from`..`to` (both included) summed into one total. */
export function salesBetween(lines: readonly SaleLine[], from: string, to: string): SalesTotal {
  return sumSales(lines.filter((line) => line.day >= from && line.day <= to))
}

/**
 * How far `current` moved from `previous`, as a fraction (0.12 = +12%). Null when there
 * is nothing before to compare with — a trạm's first week is not "+∞%".
 */
export function relativeChange(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return (current - previous) / previous
}

/**
 * The ngày of `from`..`to` with no ca at all, oldest first. A ca is opened by its first
 * ảnh, so such a ngày has no số liệu, no bán hàng and nothing to export.
 */
export function daysWithoutShift(
  shiftDays: ReadonlySet<string>,
  from: string,
  to: string
): string[] {
  return daysBetween(from, to).filter((day) => !shiftDays.has(day))
}

/**
 * How many ngày the tồn lasts at `dailyLiters` a ngày. Null when nothing sells (no rate to
 * divide by) or nothing is left to last.
 */
export function daysOfCover(stockLiters: number, dailyLiters: number): number | null {
  if (dailyLiters <= 0 || stockLiters <= 0) return null
  return stockLiters / dailyLiters
}
