import type { DayLedgerRow } from '@/lib/inventory/book-stock'
import { IMPORT_PAGE_SIZE } from '@/lib/inventory/import-selection'

/** One line of the Sổ sách theo ngày table: a ngày of one nhiên liệu. */
export type LedgerRow = DayLedgerRow & { fuel: string }

/** What the Sổ sách theo ngày URL carries, exactly as it carries it — untrusted. */
export type LedgerParams = {
  /** Từ ngày, as `YYYY-MM-DD`. */
  from?: string
  /** Đến ngày, as `YYYY-MM-DD`. */
  to?: string
  /**
   * The nhiên liệu to narrow to, as their khóa separated by commas. Absent — or naming
   * nothing the sổ sách holds — means tất cả nhiên liệu.
   */
  fuel?: string
  page?: string
}

/** Everything the Sổ sách tab renders: the page of rows, the pager, and the bộ lọc. */
export type LedgerSelection = {
  /** The page of rows to render, newest first. */
  rows: LedgerRow[]
  /** How many survived the filter, before the page was taken — what the pager sizes from. */
  total: number
  /** The page actually applied, after clamping whatever the URL said. */
  page: number
  /** Every nhiên liệu the sổ sách holds a ngày for — what the bộ lọc menu offers. */
  options: string[]
  /** Từ ngày as applied, `YYYY-MM-DD`, or absent — what the bộ lọc re-renders with. */
  from?: string
  /** Đến ngày as applied, `YYYY-MM-DD`, or absent — what the bộ lọc re-renders with. */
  to?: string
  /** The nhiên liệu as applied, empty for tất cả — what the bộ lọc re-renders with. */
  fuels: string[]
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * A ngày bound as the rows carry it: the `YYYY-MM-DD` itself, once it is known to name
 * a real ngày.
 *
 * `dailyLedger` keys every row by `movementDate.toISOString().slice(0, 10)`, and
 * `movement_date` is a ngày label rather than a moment, so both ends of the comparison
 * are already the same ten characters and the filter is a plain string compare. This is
 * the Báo cáo MISA rule, not the Lịch sử nhập hàng one: parsing at `+07:00` is for
 * `imported_at`, which really is the instant a xe bồn discharged.
 *
 * The round-trip through `Date` is what rejects a ngày that doesn't exist: `Date` rolls
 * 30/02 forward to 02/03 rather than refusing it, and filtering by a ngày nobody typed
 * is worse than not filtering. Anything that isn't a real `YYYY-MM-DD` is ignored, so a
 * mistyped or stale link still gives a usable screen rather than an error.
 */
function readDay(raw: string | undefined): string | undefined {
  if (!raw || !ISO_DAY.test(raw)) return undefined
  const day = new Date(`${raw}T00:00:00.000Z`)
  if (Number.isNaN(day.getTime())) return undefined
  return day.toISOString().slice(0, 10) === raw ? raw : undefined
}

/**
 * The nhiên liệu asked for that the sổ sách actually holds, in the order the menu
 * offers them.
 *
 * Narrowing what is on offer rather than mapping what the URL listed is what settles
 * the order — however the boxes were ticked, the URL reads the same — and what drops
 * both duplicates and a khóa this trạm has no ngày for.
 */
function readFuels(raw: string | undefined, options: string[]): string[] {
  if (!raw) return []
  const asked = new Set(raw.split(','))
  return options.filter((fuel) => asked.has(fuel))
}

/** The page in the URL, or 1 for anything that isn't a whole number of at least one. */
function readPage(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1
}

/**
 * What the Sổ sách theo ngày table shows: the ngày of the nhiên liệu kế toán asked for,
 * one page at a time.
 *
 * The single seam between the URL and the sổ sách, and pure — every rule worth testing
 * lives here and needs no database.
 *
 * The rows are handed in **already chained**, and that is the point. Each row's Tồn đầu
 * ngày is the previous row's Tồn cuối ngày, running from the số đầu kỳ anchor, so a từ
 * ngày must never reach the `inventoryMovement` query: narrowing there would restart
 * every chain at the anchor and put a wrong — but entirely plausible — Tồn đầu ngày on
 * screen. Filtering the finished rows leaves the first one visible still carrying every
 * lít that moved before it.
 *
 * `options` is read off the rows and never off the filter, so ticking one nhiên liệu
 * cannot empty the menu that un-ticks it. It lists what the sổ sách holds rather than
 * what the trạm sells today: a nhiên liệu Trường Thịnh has since stopped selling still
 * has ngày on this screen, and every option on offer is one that returns rows.
 *
 * Both ngày bounds are inclusive, either may be left off, and a range running backwards
 * simply matches nothing.
 */
export function ledgerSelection(params: LedgerParams, rows: LedgerRow[]): LedgerSelection {
  const page = readPage(params.page)
  const from = readDay(params.from)
  const to = readDay(params.to)
  // What is on offer has to be known before anything can be narrowed to it: the filter
  // keeps rows by the nhiên liệu *as applied*, never by what the URL asked for, so a
  // khóa the sổ sách holds no ngày for empties nothing. Filtering on the raw ask would
  // leave the screen showing no rows while `hasLedgerFilter` said it was unfiltered.
  const options = [...new Set(rows.map((row) => row.fuel))].sort()
  const fuels = readFuels(params.fuel, options)
  const wanted = fuels.length ? new Set(fuels) : null
  const matched: LedgerRow[] = []
  for (const row of rows) {
    if (from && row.date < from) continue
    if (to && row.date > to) continue
    if (wanted && !wanted.has(row.fuel)) continue
    matched.push(row)
  }
  const skip = (page - 1) * IMPORT_PAGE_SIZE
  return {
    rows: matched.slice(skip, skip + IMPORT_PAGE_SIZE),
    total: matched.length,
    page,
    options,
    fuels,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }
}

/**
 * Whether the sổ sách is narrowed rather than showing every ngày.
 *
 * Read off the filter *as applied*, not as typed, so a mistyped ngày or a nhiên liệu
 * this trạm has no ngày for — neither of which narrows anything — leaves the screen
 * saying it is showing the full sổ sách, and leaves Xóa bộ lọc out of the way when
 * there is nothing to clear.
 */
export function hasLedgerFilter(filter: Pick<LedgerSelection, 'from' | 'to' | 'fuels'>): boolean {
  return Boolean(filter.from || filter.to || filter.fuels.length)
}
