import type { Prisma } from '@/lib/generated/prisma/client'

/** Rows per page of the Báo cáo MISA list, following the Hàng tồn histories. */
export const MISA_REPORT_PAGE_SIZE = 20

/** What the Báo cáo MISA URL carries, exactly as it carries it — untrusted, all optional. */
export type MisaReportParams = {
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
}

/** The page in the URL, or 1 for anything that isn't a whole number of at least one. */
function readPage(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1
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
  return {
    where: { status: 'completed', stationId: { in: stationIds } },
    orderBy: [{ shiftDate: 'desc' }, { id: 'asc' }],
    skip: (page - 1) * MISA_REPORT_PAGE_SIZE,
    take: MISA_REPORT_PAGE_SIZE,
    page,
  }
}
