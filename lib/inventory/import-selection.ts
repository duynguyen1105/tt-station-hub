import type { Prisma } from '@/lib/generated/prisma/client'

/** Rows per page of the Lịch sử nhập hàng list, shared with the other Hàng tồn tabs. */
export const IMPORT_PAGE_SIZE = 20

/** What the Lịch sử nhập hàng URL carries, exactly as it carries it — untrusted. */
export type ImportSelectionParams = {
  /** Từ ngày, as `YYYY-MM-DD`. */
  from?: string
  /** Đến ngày, as `YYYY-MM-DD`. */
  to?: string
  /** Hầm, comma-joined; empty or absent means every hầm. */
  tank?: string
  /** Nhiên liệu khóa, comma-joined; empty or absent means every nhiên liệu. */
  fuel?: string
  /** Người nhập, by hồ sơ id, comma-joined; empty or absent means everyone. */
  creator?: string
  page?: string
}

/**
 * Everything a screen needs to run its two queries over phiếu nhập: the page of rows
 * and the count of them all. Prisma's own `FindManyArgs` won't do — `count` takes
 * `where` alone — so the pieces are handed over separately, alongside the filter as
 * applied.
 */
export type ImportSelection = {
  where: Prisma.FuelImportWhereInput
  orderBy: Prisma.FuelImportOrderByWithRelationInput[]
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
  /** Người nhập as applied, by id, in the ô chọn's order; empty means tất cả. */
  creators: string[]
}

/**
 * The hầm, nhiên liệu and người nhập this trạm's phiếu nhập actually name — what the URL
 * is narrowed against. Built by `loadImportFilterOptions`, which reads them off the slips
 * so every option on the menu matches at least one row.
 */
export type ImportSelectionOptions = { tanks: string[]; fuels: string[]; creators: string[] }

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** Vietnam runs at GMT+7 all year, so the shift to its calendar ngày is a constant. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000

/**
 * A ngày bound from the URL as the column stores it: a real instant at `+07:00`.
 *
 * `fuelImports.imported_at` is a timestamp — the moment the xe bồn discharged — and not
 * a date label, so a ngày kế toán types means that ngày *in Vietnam*: từ ngày opens at
 * its first millisecond and đến ngày closes at its last. This is the opposite of the
 * Báo cáo MISA selection, which parses at UTC midnight precisely because `shift_date`
 * really is a label; parsing that way here would drag every bound 07:00 into the day
 * before and pick up the wrong deliveries.
 *
 * The round-trip is what rejects a ngày that doesn't exist: `Date` rolls 30/02 forward
 * to 02/03 rather than refusing it, and filtering by a ngày nobody typed is worse than
 * not filtering. Anything that isn't a real `YYYY-MM-DD` is ignored, so a mistyped or
 * stale link still gives a usable screen rather than an error.
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
 * one move that makes the result canonical: repeats collapse, a hầm no phiếu nhập names or
 * a người nhập who never recorded one falls out, and however the URL listed them the pager
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
 * What the Lịch sử nhập hàng list shows: the phiếu nhập of the trạm asked for, newest
 * first, one page at a time, narrowed by any of ngày, hầm, nhiên liệu and người nhập.
 *
 * The single seam between the URL and Prisma for phiếu nhập — the Hàng tồn tab and the
 * Xuất Excel route both hand in the raw parameters and spread the result, so the file
 * kế toán downloads holds exactly what the screen says it is showing, and every rule
 * worth testing lives here and needs no database.
 *
 * `stationId` is handed in rather than parsed, because the two callers scope
 * differently: the tab is one trạm by its route, while the export falls back to every
 * trạm the viewer can reach. Access is decided by the caller, before this is reached.
 *
 * Both ngày bounds are inclusive, any criterion may be left off, and a range running
 * backwards simply matches nothing.
 *
 * Ordered newest-first by `importedAt`, with `id` breaking the tie: two phiếu nhập can
 * share an instant, and an unordered tie could hide one between two pages.
 */
export function importSelection(
  params: ImportSelectionParams,
  stationId: Prisma.FuelImportWhereInput['stationId'],
  offered: ImportSelectionOptions
): ImportSelection {
  const page = readPage(params.page)
  const from = readBound(params.from, 'start')
  const to = readBound(params.to, 'end')
  const tanks = readPicks(params.tank, offered.tanks)
  const fuels = readPicks(params.fuel, offered.fuels)
  const creators = readPicks(params.creator, offered.creators)
  const importedAt = {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {}),
  }
  return {
    where: {
      stationId,
      ...(from || to ? { importedAt } : {}),
      ...(tanks.length ? { tankCode: { in: tanks } } : {}),
      ...(fuels.length ? { fuelType: { in: fuels } } : {}),
      // A phiếu nhập written before người nhập was recorded carries none at all. `in`
      // leaves those rows out, which is what asking for one person's slips means; they
      // are still there with this criterion off.
      ...(creators.length ? { createdBy: { in: creators } } : {}),
    },
    orderBy: [{ importedAt: 'desc' }, { id: 'asc' }],
    skip: (page - 1) * IMPORT_PAGE_SIZE,
    take: IMPORT_PAGE_SIZE,
    page,
    ...(from ? { from: params.from } : {}),
    ...(to ? { to: params.to } : {}),
    tanks,
    fuels,
    creators,
  }
}

/**
 * Whether the list is narrowed rather than showing every phiếu nhập.
 *
 * Read off the filter *as applied*, not as typed, so a mistyped ngày or a hầm no phiếu
 * nhập names — neither of which narrows anything — leaves the screen saying it is showing
 * the full list, and leaves Xóa bộ lọc out of the way when there is nothing to clear.
 */
export function hasImportFilter(
  filter: Pick<ImportSelection, 'from' | 'to' | 'tanks' | 'fuels' | 'creators'>
): boolean {
  return Boolean(
    filter.from || filter.to || filter.tanks.length || filter.fuels.length || filter.creators.length
  )
}
