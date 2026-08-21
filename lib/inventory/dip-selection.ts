import type { Prisma } from '@/lib/generated/prisma/client'

import { IMPORT_PAGE_SIZE } from './import-selection'

/**
 * Rows per page of the Lịch sử đo bồn list. The Hàng tồn tabs share one page size — the
 * pager under this table is the same one the phiếu nhập table uses and sizes itself from
 * there, so the two cannot disagree about what a page is.
 */
export const DIP_PAGE_SIZE = IMPORT_PAGE_SIZE

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

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** Vietnam runs at GMT+7 all year, so the shift to its calendar ngày is a constant. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000

/**
 * A ngày bound from the URL as the column stores it: a real instant at `+07:00`.
 *
 * `tank_dip_records.measured_at` is a timestamp — when the dip-stick photo was taken — and
 * not a date label, so a ngày kế toán types means that ngày *in Vietnam*: từ ngày opens at
 * its first millisecond and đến ngày closes at its last. This is the same reading
 * `importSelection` gives `imported_at`, and the opposite of the Báo cáo MISA selection,
 * which parses at UTC midnight precisely because `shift_date` really is a label; parsing
 * that way here would drag every bound 07:00 into the day before and pick up the wrong
 * measurements.
 *
 * The round-trip is what rejects a ngày that doesn't exist: `Date` rolls 30/02 forward to
 * 02/03 rather than refusing it, and filtering by a ngày nobody typed is worse than not
 * filtering. Anything that isn't a real `YYYY-MM-DD` is ignored, so a mistyped or stale
 * link still gives a usable screen rather than an error.
 */
function readBound(raw: string | undefined, edge: 'start' | 'end'): Date | undefined {
  if (!raw || !ISO_DAY.test(raw)) return undefined
  const at = new Date(`${raw}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}+07:00`)
  if (Number.isNaN(at.getTime())) return undefined
  if (new Date(at.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10) !== raw) return undefined
  return at
}

/**
 * The picks from a comma-joined parameter, as the list of what may be picked orders them.
 *
 * Read by filtering what is on offer rather than by mapping what the URL said, which is the
 * one move that makes the result canonical: repeats collapse, a hầm this trạm doesn't have
 * or a trạng thái nobody writes falls out, and however the URL listed them the pager
 * re-serialises one settled order. Ticking nothing — or nothing that survives — means tất
 * cả, so a stale link narrows less than it asked for and never more.
 */
function readPicks(raw: string | undefined, offered: readonly string[]): string[] {
  if (!raw) return []
  const asked = new Set(raw.split(','))
  return offered.filter((option) => asked.has(option))
}

/** The page in the URL, or 1 for anything that isn't a whole number of at least one. */
function readPage(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1
}

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
  const from = readBound(params.from, 'start')
  const to = readBound(params.to, 'end')
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
