import { FILTER_PAGE_SIZE, readInstantBound, readPage, readPicks } from '@/lib/filters/params'
import type { Prisma } from '@/lib/generated/prisma/client'

/**
 * Rows per page of the Lịch sử đo bồn list. Every filtered list in the app shares one
 * page size — the pager under this table is the same one the phiếu nhập table uses and
 * sizes itself from there, so the two cannot disagree about what a page is.
 */
export const DIP_PAGE_SIZE = FILTER_PAGE_SIZE

/** The trạng thái a đo hầm is ever written with — the ô chọn's whole list. */
export const DIP_STATUSES = ['pending', 'approved', 'rejected'] as const

/** What the Lịch sử đo bồn URL carries, exactly as it carries it — untrusted. */
export type DipSelectionParams = {
  /** Từ ngày, as `YYYY-MM-DD`. */
  from?: string
  /** Đến ngày, as `YYYY-MM-DD`. */
  to?: string
  /** Hầm, comma-joined; empty or absent means every hầm. */
  tank?: string
  /** Nhiên liệu khóa, comma-joined; empty or absent means every nhiên liệu. */
  fuel?: string
  /** Trạng thái, comma-joined; empty or absent means every trạng thái. */
  status?: string
  page?: string
}

/**
 * Everything a screen needs to run its two queries over đo hầm: the page of rows and the
 * count of them all. Prisma's own `FindManyArgs` won't do — `count` takes `where` alone —
 * so the pieces are handed over separately, alongside the filter as applied.
 */
export type DipSelection = {
  where: Prisma.TankDipRecordWhereInput
  orderBy: Prisma.TankDipRecordOrderByWithRelationInput[]
  skip: number
  take: number
  /** The page actually applied, after clamping whatever the URL said. */
  page: number
  /** Từ ngày as applied, `YYYY-MM-DD`, or absent — what the bộ lọc re-renders with. */
  from?: string
  /** Đến ngày as applied, `YYYY-MM-DD`, or absent — what the bộ lọc re-renders with. */
  to?: string
  /** Hầm as applied, in the ô chọn's order; empty means tất cả. */
  tanks: string[]
  /** Nhiên liệu as applied, in the ô chọn's order; empty means tất cả. */
  fuels: string[]
  /** Trạng thái as applied, in `DIP_STATUSES` order; empty means tất cả. */
  statuses: string[]
}

/** The hầm and nhiên liệu this trạm actually has — what the URL is narrowed against. */
export type DipSelectionOptions = { tanks: string[]; fuels: string[] }

/**
 * What the Lịch sử đo bồn list shows: the đo hầm of the trạm asked for, newest first, one
 * page at a time, narrowed by any of ngày, hầm, nhiên liệu and trạng thái.
 *
 * The single seam between the URL and Prisma for đo hầm — the tab hands in the raw
 * parameters and spreads the result, so every rule worth testing lives here and needs no
 * database.
 *
 * A từ chối read is listed like any other unless trạng thái says otherwise: this table is
 * the audit trail of what was decided, not just of what counts, which is why
 * `countableDipWhere` — the rule for the *figures* a dip feeds — has no place here.
 *
 * `stationId` is handed in rather than parsed; access is decided by the caller, before this
 * is reached. Both ngày bounds are inclusive, any criterion may be left off, and a range
 * running backwards simply matches nothing.
 *
 * Ordered newest-first by `measuredAt`, with `id` breaking the tie: a burst of Zalo photos
 * lands on one instant, and an unordered tie could hide a đo hầm between two pages.
 */
export function dipSelection(
  params: DipSelectionParams,
  stationId: Prisma.TankDipRecordWhereInput['stationId'],
  offered: DipSelectionOptions
): DipSelection {
  const page = readPage(params.page)
  // `measured_at` is the instant the dip-stick photo was taken, not a ngày label, so both
  // bounds are read at +07:00. Reading them at UTC midnight — right for `shift_date`,
  // which is a label — would drag each one 07:00 into the ngày before.
  const from = readInstantBound(params.from, 'start')
  const to = readInstantBound(params.to, 'end')
  const tanks = readPicks(params.tank, offered.tanks)
  const fuels = readPicks(params.fuel, offered.fuels)
  const statuses = readPicks(params.status, DIP_STATUSES)
  const measuredAt = {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {}),
  }
  return {
    where: {
      stationId,
      ...(from || to ? { measuredAt } : {}),
      ...(tanks.length ? { tankCode: { in: tanks } } : {}),
      // A đo hầm whose biển the AI could not place carries no nhiên liệu at all. `in`
      // leaves those rows out, which is what asking for Dầu DO means; they are still
      // there — and still the ones most worth a look — with this criterion off.
      ...(fuels.length ? { fuelType: { in: fuels } } : {}),
      ...(statuses.length ? { reviewStatus: { in: statuses } } : {}),
    },
    orderBy: [{ measuredAt: 'desc' }, { id: 'asc' }],
    skip: (page - 1) * DIP_PAGE_SIZE,
    take: DIP_PAGE_SIZE,
    page,
    ...(from ? { from: params.from } : {}),
    ...(to ? { to: params.to } : {}),
    tanks,
    fuels,
    statuses,
  }
}

/**
 * Whether the list is narrowed rather than showing every đo hầm.
 *
 * Read off the filter *as applied*, not as typed, so a mistyped ngày — which narrows
 * nothing — leaves the screen saying it is showing the full history, and leaves Xóa bộ lọc
 * out of the way when there is nothing to clear.
 */
export function hasDipFilter(
  filter: Pick<DipSelection, 'from' | 'to' | 'tanks' | 'fuels' | 'statuses'>
): boolean {
  return Boolean(
    filter.from || filter.to || filter.tanks.length || filter.fuels.length || filter.statuses.length
  )
}
