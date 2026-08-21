/**
 * What every bộ lọc in the app is made of: reading its criteria out of the URL, and
 * writing them back into one.
 *
 * The screens that filter — Chốt ca, Báo cáo MISA, and the ba tab of Hàng tồn — all keep
 * their state in the URL and nowhere else, so each one needs the same few readers and the
 * same serialiser. They were written a screen at a time and each grew its own copy; the
 * copies agreed, which is exactly why the drift would have been hard to notice. Sharing
 * them here means the form that writes a link and the pager that rebuilds it can no
 * longer disagree about what that link says.
 */

/** A ngày as the date inputs and the URL carry it. */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** Vietnam runs at GMT+7 all year, so the shift to its calendar ngày is a constant. */
export const VN_OFFSET_MS = 7 * 60 * 60 * 1000

/** How many rows a filtered list shows at once, the same on every screen that pages. */
export const FILTER_PAGE_SIZE = 20

/**
 * A ngày bound as a column that stores *instants* wants it: a real moment at `+07:00`.
 *
 * Use this against a plain `DateTime` — `tank_dip_records.measured_at`, the moment a
 * dip-stick photo was taken, or `fuel_imports.imported_at`, the moment a xe bồn
 * discharged. A ngày kế toán types means that ngày *in Vietnam*, so từ ngày opens at its
 * first millisecond and đến ngày closes at its last.
 *
 * Against a `@db.Date` column this would be wrong in a way no test in UTC would catch:
 * see `readDayBound`.
 *
 * The round-trip is what rejects a ngày that doesn't exist: `Date` rolls 30/02 forward to
 * 02/03 rather than refusing it, and filtering by a ngày nobody typed is worse than not
 * filtering. Anything that isn't a real `YYYY-MM-DD` is ignored, so a mistyped or stale
 * link still gives a usable screen rather than an error.
 */
export function readInstantBound(raw: string | undefined, edge: 'start' | 'end'): Date | undefined {
  if (!raw || !ISO_DAY.test(raw)) return undefined
  const at = new Date(`${raw}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}+07:00`)
  if (Number.isNaN(at.getTime())) return undefined
  if (new Date(at.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10) !== raw) return undefined
  return at
}

/**
 * A ngày bound as a column that stores *labels* wants it: UTC midnight, labelled with the
 * Vietnam calendar ngày.
 *
 * Use this against a `@db.Date` — `shifts.shift_date`, the ngày a ca belongs to, which is
 * a label and not a moment. Parsing at `+07:00` the way `readInstantBound` does would drag
 * every bound 17:00 into the ngày before and select the neighbouring ca.
 *
 * Rejects an impossible ngày by the same round-trip, and for the same reason.
 */
export function readDayBound(raw: string | undefined): Date | undefined {
  if (!raw || !ISO_DAY.test(raw)) return undefined
  const day = new Date(`${raw}T00:00:00.000Z`)
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== raw) return undefined
  return day
}

/**
 * A ngày bound as rows already keyed by ngày carry it: the `YYYY-MM-DD` itself, once it
 * is known to name a real ngày.
 *
 * `dailyLedger` keys every row by `movementDate.toISOString().slice(0, 10)`, so both ends
 * of the comparison are the same ten characters and the filter is a plain string compare.
 * This is the `readDayBound` rule expressed as a string, not the `readInstantBound` one.
 */
export function readDayKey(raw: string | undefined): string | undefined {
  return readDayBound(raw) ? raw : undefined
}

/**
 * The picks from a comma-joined parameter, as the list of what may be picked orders them.
 *
 * Read by filtering what is on offer rather than by mapping what the URL said, which is
 * the one move that makes the result canonical: repeats collapse, a hầm this trạm doesn't
 * have or a trạng thái nobody writes falls out, and however the URL listed them the pager
 * re-serialises one settled order. Ticking nothing — or nothing that survives — means tất
 * cả, so a stale link narrows less than it asked for and never more.
 */
export function readPicks<T extends string>(raw: string | undefined, offered: readonly T[]): T[] {
  if (!raw) return []
  const asked = new Set(raw.split(','))
  return offered.filter((option) => asked.has(option))
}

/** The page in the URL, or 1 for anything that isn't a whole number of at least one. */
export function readPage(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1
}

/**
 * A bộ lọc on its way back into a URL: each criterion under its parameter name, a
 * multi-pick one comma-joined, and anything empty left out entirely.
 *
 * The key order here is the parameter order in the link, so callers write the record in
 * the order they want to read.
 */
export type FilterCriteria = Record<string, string | string[] | undefined>

/**
 * The criteria as a query string, without the `?`.
 *
 * Leaving empty criteria out is what keeps "tất cả" and "narrowed to nothing"
 * distinguishable in a link, and what keeps an unfiltered screen's URL clean. `page` is
 * carried only past the first, so page 1 and no page at all are the same link — stepping
 * back to the start of a list doesn't leave a stale `page=1` behind.
 */
export function filterQuery(criteria: FilterCriteria, page?: number): string {
  const query = new URLSearchParams()
  for (const [name, value] of Object.entries(criteria)) {
    if (!value) continue
    if (Array.isArray(value)) {
      if (value.length) query.set(name, value.join(','))
    } else {
      query.set(name, value)
    }
  }
  if (page !== undefined && page > 1) query.set('page', String(page))
  return query.toString()
}

/**
 * The criteria as a link to `base` — the shape every pager, every filter form and the
 * Xuất Excel link all want, so none of them has to remember to drop a lone `?`.
 */
export function filterHref(base: string, criteria: FilterCriteria, page?: number): string {
  const qs = filterQuery(criteria, page)
  return qs ? `${base}?${qs}` : base
}
