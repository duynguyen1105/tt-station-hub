import { FILTER_PAGE_SIZE, readDayBound, readPage, readPicks } from '@/lib/filters/params'
import type { Prisma } from '@/lib/generated/prisma/client'

/** Rows per page of the Báo cáo MISA list, following the Hàng tồn histories. */
export const MISA_REPORT_PAGE_SIZE = FILTER_PAGE_SIZE

/** What the Báo cáo MISA URL carries, exactly as it carries it — untrusted, all optional. */
export type MisaReportParams = {
  /** Từ ngày, as `YYYY-MM-DD`. */
  from?: string
  /** Đến ngày, as `YYYY-MM-DD`. */
  to?: string
  /**
   * The trạm to narrow to, as their identifiers separated by commas. Absent — or
   * naming nothing the viewer can reach — means tất cả trạm.
   */
  station?: string
  page?: string
}

/**
 * Everything the Báo cáo MISA page needs to run its two queries: the page of ca and
 * the count of them all. Prisma's own `FindManyArgs` won't do — `count` takes `where`
 * alone — so the pieces are handed over separately, alongside the page as applied.
 */
export type MisaReportSelection = {
  where: Prisma.ShiftWhereInput
  orderBy: Prisma.ShiftOrderByWithRelationInput[]
  skip: number
  take: number
  /** The page actually applied, after clamping whatever the URL said. */
  page: number
  /** Từ ngày as applied, `YYYY-MM-DD`, or absent — what the form re-renders with. */
  from?: string
  /** Đến ngày as applied, `YYYY-MM-DD`, or absent — what the form re-renders with. */
  to?: string
  /** The trạm as applied, empty for tất cả trạm — what the bộ lọc re-renders with. */
  stations: string[]
}

/**
 * What the Báo cáo MISA list shows: the chốt'd ca of the trạm this viewer can reach,
 * newest ngày bán first, one page at a time.
 *
 * The single seam between the URL and Prisma for this screen — the page hands in the
 * raw parameters and the reachable trạm and spreads the result into `findMany`, so
 * every rule worth testing lives here and needs no database.
 *
 * Trạm access narrows and never widens: the reachable set is the whole of it, and a
 * kế toán phụ trách of no trạm selects nothing rather than everything.
 *
 * The trạm picked in the URL narrow that set further and can only ever be members of
 * it, so hand-editing the query string is not a way to read another trạm's ca:
 * identifiers outside the reachable set — unreachable, unknown, or not identifiers at
 * all — are dropped, and a list left holding none of them is no filter at all, leaving
 * the viewer exactly the trạm they already had.
 *
 * The ngày range is over `shiftDate` — the ngày the fuel was sold and the one MISA
 * books revenue against — so a ca sold on 31/07 and chốt'd on 02/08 belongs to tháng
 * 7, where kế toán closing the period looks for it. Both bounds are inclusive, either
 * may be left off, and a range running backwards simply matches nothing.
 *
 * Ordered by `shiftDate` — the ngày the table displays and MISA books revenue
 * against — not by `completedAt`, so a ca sold on 31/07 and chốt'd on 02/08 sorts
 * where kế toán reads it. `id` breaks the tie, since one ngày holds one ca per trạm
 * and an unordered tie could hide a ca between two pages.
 */
export function misaReportSelection(
  params: MisaReportParams,
  stationIds: string[]
): MisaReportSelection {
  const page = readPage(params.page)
  // `shift_date` is the ngày a ca belongs to — a label, not a moment — so both bounds are
  // read at UTC midnight. Reading them at +07:00, right for an instant like `imported_at`,
  // would drag each one 17:00 into the ngày before and select the neighbouring ca.
  const from = readDayBound(params.from)
  const to = readDayBound(params.to)
  const stations = readPicks(params.station, stationIds)
  const shiftDate = {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {}),
  }
  return {
    where: {
      status: 'completed',
      stationId: { in: stations.length ? stations : stationIds },
      ...(from || to ? { shiftDate } : {}),
    },
    orderBy: [{ shiftDate: 'desc' }, { id: 'asc' }],
    skip: (page - 1) * MISA_REPORT_PAGE_SIZE,
    take: MISA_REPORT_PAGE_SIZE,
    page,
    stations,
    ...(from ? { from: params.from } : {}),
    ...(to ? { to: params.to } : {}),
  }
}

/**
 * Whether kế toán is looking at a narrowed list rather than everything outstanding.
 *
 * Read off the filter *as applied*, not as typed, so a mistyped ngày or trạm the
 * viewer can't reach — both of which narrow nothing — leaves the screen saying it is
 * showing the full list, and leaves Xóa bộ lọc out of the way when there is nothing
 * to clear.
 */
export function hasMisaReportFilter(
  filter: Pick<MisaReportSelection, 'from' | 'to' | 'stations'>
): boolean {
  return Boolean(filter.from || filter.to || filter.stations.length)
}
