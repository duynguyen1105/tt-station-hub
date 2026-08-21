import type { ShiftStatus } from '@/lib/auth/reading-policy'
import { FILTER_PAGE_SIZE, readDayBound, readPage, readPicks } from '@/lib/filters/params'
import type { Prisma } from '@/lib/generated/prisma/client'

/** Rows per page of the Chốt ca list, following the Báo cáo MISA and Hàng tồn lists. */
export const SHIFT_LIST_PAGE_SIZE = FILTER_PAGE_SIZE

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
  // `shift_date` is the ngày a ca belongs to — a label, not a moment — so both bounds are
  // read at UTC midnight. Reading them at +07:00, right for an instant like `imported_at`,
  // would drag each one 17:00 into the ngày before and select the neighbouring ca.
  const from = readDayBound(params.from)
  const to = readDayBound(params.to)
  const statuses = readPicks(params.status, SHIFT_STATUSES)
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
