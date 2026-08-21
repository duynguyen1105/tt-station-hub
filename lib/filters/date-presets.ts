import { VN_OFFSET_MS } from '@/lib/filters/params'

/** The khoảng ngày a preset button fills in, named after what kế toán calls it. */
export type DatePreset = 'today' | 'thisMonth' | 'lastMonth'

/** Từ ngày and đến ngày as the date inputs and the URL carry them, `YYYY-MM-DD`. */
type DatePresetRange = { from: string; to: string }

/**
 * The Vietnam calendar ngày a moment falls in, as year / month index / day.
 *
 * `now` is an instant; the ngày kế toán would name for it is seven hours ahead of
 * UTC, so 00:30 on 01/09 in Vietnam is still 31/08 in UTC and belongs to tháng 9.
 */
function vietnamDay(now: Date) {
  const shifted = new Date(now.getTime() + VN_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  }
}

/**
 * A ngày as `YYYY-MM-DD`, built from parts that are allowed to run off either end of
 * their month: `Date.UTC` rolls month `-1` back into the previous December and day
 * `0` back onto the last ngày of the month before, which is where the length of every
 * month — 30, 31, and February in a leap year or not — comes from without a table.
 */
function isoDay(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10)
}

/**
 * The two ngày a preset button writes into Từ ngày and Đến ngày.
 *
 * A preset is not a third piece of state: it fills the same two inputs kế toán could
 * have typed, so the filter it produces is indistinguishable from a hand-typed one
 * and the URL stays the only record of what is on screen.
 *
 * `now` is passed in rather than read from the clock, so the arithmetic — where the
 * bugs are, at the turn of a month and of a year — is testable at any moment.
 *
 * Tháng trước is the one that earns its place: kế toán closes the previous month's
 * books in the first days of the new one.
 */
export function datePresetRange(preset: DatePreset, now: Date): DatePresetRange {
  const { year, month, day } = vietnamDay(now)
  switch (preset) {
    case 'today':
      return { from: isoDay(year, month, day), to: isoDay(year, month, day) }
    case 'thisMonth':
      return { from: isoDay(year, month, 1), to: isoDay(year, month + 1, 0) }
    case 'lastMonth':
      return { from: isoDay(year, month - 1, 1), to: isoDay(year, month, 0) }
  }
}

/** Every preset, in the order the bộ lọc offers them and this module tries them. */
const PRESETS: DatePreset[] = ['today', 'thisMonth', 'lastMonth']

/**
 * Which preset, if any, the khoảng ngày currently applied is exactly.
 *
 * A preset is not stored anywhere — it only ever writes the two ngày — so the only way
 * to tick the one in force, or to name it on a chip, is to work backwards from those
 * two ngày. Both bounds have to match: a range with one end missing, or one kế toán
 * typed by hand, is nobody's preset and shows as itself.
 *
 * The presets can coincide — on ngày 1 of a month, hôm nay and tháng này share a từ
 * ngày — so the order above decides, and it is the order kế toán reads them in.
 */
export function matchingDatePreset(
  from: string | undefined,
  to: string | undefined,
  now: Date
): DatePreset | undefined {
  if (!from || !to) return undefined
  return PRESETS.find((preset) => {
    const range = datePresetRange(preset, now)
    return range.from === from && range.to === to
  })
}
