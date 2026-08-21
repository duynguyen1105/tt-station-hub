import type { ShiftStatus } from '@/lib/auth/reading-policy'
import type { Prisma } from '@/lib/generated/prisma/client'

/** Rows per page of the Chốt ca list, following the Báo cáo MISA and Hàng tồn lists. */
export const SHIFT_LIST_PAGE_SIZE = 20

/**
 * Every trạng thái a ca can be in, in the order it passes through them.
 *
 * One list doing two jobs: the order the bộ lọc offers them — which is the order the
 * ca itself moves, not the alphabet — and the order that canonicalises whatever the
 * URL asked for. Typed as `ShiftStatus[]` so it cannot drift from the union in
 * `lib/auth/reading-policy.ts` without the type-check saying so.
 */
export const SHIFT_STATUSES: ShiftStatus[] = [
  'open',
  'collecting_photos',
  'ai_processing',
  'pending_review',
  'completed',
  'cancelled',
]

/** What the Chốt ca URL carries, exactly as it carries it — untrusted, all optional. */
export type ShiftListParams = {
  /** Từ ngày, as `YYYY-MM-DD`. */
  from?: string
  /** Đến ngày, as `YYYY-MM-DD`. */
  to?: string
  /**
   * The trạng thái to narrow to, separated by commas. Absent — or naming nothing a ca
   * can actually be in — means tất cả trạng thái.
   */
  status?: string
  page?: string
}

/**
 * Everything the Chốt ca tab needs to run its two queries: the page of ca and the
 * count of them all. Prisma's own `FindManyArgs` won't do — `count` takes `where`
 * alone — so the pieces are handed over separately, alongside the filter as applied.
 */
export type ShiftListSelection = {
  where: Prisma.ShiftWhereInput
  orderBy: Prisma.ShiftOrderByWithRelationInput[]
  skip: number
  take: number
  /** The page actually applied, after clamping whatever the URL said. */
  page: number
  /** Từ ngày as applied, `YYYY-MM-DD`, or absent — what the bộ lọc re-renders with. */
  from?: string
  /** Đến ngày as applied, `YYYY-MM-DD`, or absent — what the bộ lọc re-renders with. */
  to?: string
  /** The trạng thái as applied, empty for tất cả — what the bộ lọc re-renders with. */
  statuses: ShiftStatus[]
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * A ngày bound from the URL as the column stores it: UTC midnight *labelled with* the
 * Vietnam calendar day, since `shifts.shift_date` is a date and not an instant.
 *
 * The same reading the Báo cáo MISA selection makes of the same column, and the
 * opposite of the one `lib/inventory/import-selection.ts` makes of `imported_at`,
 * which really is an instant: parsing at `+07:00` here would drag every bound 17:00
 * into the day before and select the neighbouring ca.
 *
 * Anything that isn't a real `YYYY-MM-DD` is ignored, so a mistyped or stale link
 * still gives a usable screen. The round-trip is what rejects a ngày that doesn't
 * exist: `Date` rolls 30/02 forward to 02/03 rather than refusing it, and filtering by
 * a ngày nobody typed is worse than not filtering.
 */
function readDay(raw: string | undefined): Date | undefined {
  if (!raw || !ISO_DAY.test(raw)) return undefined
  const day = new Date(`${raw}T00:00:00.000Z`)
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== raw) return undefined
  return day
}

/**
 * The trạng thái named in the URL that a ca can actually be in, in lifecycle order.
 *
 * Filtering `SHIFT_STATUSES` rather than mapping over what the URL asked for is what
 * makes the result canonical: it drops repeats and states that don't exist on the way
 * through, so `completed,open`, `open,completed` and `open,completed,open` all come
 * back as the same list and the pager re-serialises one query string rather than
 * whichever one was pasted in.
 */
function readStatuses(raw: string | undefined): ShiftStatus[] {
  if (!raw) return []
  const asked = new Set(raw.split(','))
  return SHIFT_STATUSES.filter((status) => asked.has(status))
}

/** The page in the URL, or 1 for anything that isn't a whole number of at least one. */
function readPage(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1
}

/**
 * What the Chốt ca tab shows: the ca of the trạm whose tab this is, newest ngày bán
 * first, one page at a time.
 *
 * The single seam between the URL and Prisma for this screen — the page hands in the
 * raw parameters and spreads the result into `findMany`, so every rule worth testing
 * lives here and needs no database.
 *
 * `stationId` is handed in rather than parsed: the trạm is fixed by the route and its
 * access was already decided by `requireStationAccess`, before this is reached. There
 * is nothing in the query string that can widen it.
 *
 * The trạng thái picked in the URL can only ever be states a ca is really in, so a
 * hand-edited query string narrows or it does nothing: unknown states are dropped, and
 * a list left holding none of them is no filter at all, leaving every ca on screen.
 *
 * The ngày range is over `shiftDate` — the ngày the fuel was sold, which is the ngày
 * the table prints — so a ca sold on 31/07 and chốt'd on 02/08 belongs to tháng 7,
 * where it is looked for. Both bounds are inclusive, either may be left off, and a
 * range running backwards simply matches nothing.
 *
 * Ordered by that same `shiftDate`, newest first, with `id` breaking the tie. The tie
 * is real here in a way it is not on Báo cáo MISA: a trạm can run a ca Sáng and a ca
 * Chiều on one ngày — `@@unique([stationId, shiftDate, shiftType])` is what permits it
 * — and an unordered tie could hide one of them between two pages.
 */
export function shiftListSelection(params: ShiftListParams, stationId: string): ShiftListSelection {
  const page = readPage(params.page)
  const from = readDay(params.from)
  const to = readDay(params.to)
  const statuses = readStatuses(params.status)
  const shiftDate = {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {}),
  }
  return {
    where: {
      stationId,
      ...(statuses.length ? { status: { in: statuses } } : {}),
      ...(from || to ? { shiftDate } : {}),
    },
    orderBy: [{ shiftDate: 'desc' }, { id: 'asc' }],
    skip: (page - 1) * SHIFT_LIST_PAGE_SIZE,
    take: SHIFT_LIST_PAGE_SIZE,
    page,
    statuses,
    ...(from ? { from: params.from } : {}),
    ...(to ? { to: params.to } : {}),
  }
}

/**
 * Whether the list is narrowed rather than showing every ca of this trạm.
 *
 * Read off the filter *as applied*, not as typed, so a mistyped ngày or a trạng thái
 * that doesn't exist — neither of which narrows anything — leaves the screen saying it
 * is showing the full list, and leaves Xóa bộ lọc out of the way when there is nothing
 * to clear.
 */
export function hasShiftListFilter(
  filter: Pick<ShiftListSelection, 'from' | 'to' | 'statuses'>
): boolean {
  return Boolean(filter.from || filter.to || filter.statuses.length)
}
