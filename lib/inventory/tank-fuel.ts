// What a hầm holds, read off the trụ that draw from it. There is no Hầm table: a
// hầm is only the `tankCode` string the trụ rows repeat, so its nhiên liệu is only
// ever what those trụ sell.

/**
 * The nhiên liệu of a hầm, from the trụ drawing on it — the first active trụ whose
 * `tankCode` is the hầm's, or null for a hầm dự phòng no trụ names. Callers hand in
 * the trạm's active trụ; a trụ that has been retired says nothing about the hầm.
 *
 * Pure, and shared by `ingestTankDip` (which fills a đo hầm whose plate word the
 * trạm could not place) and the Tổng quan tab (which shows the same answer for a
 * hầm whose latest đo hầm carries none), so a row and its screen cannot disagree.
 */
export function tankFuelFrom(
  dispensers: readonly { tankCode: string | null; fuelType: string }[],
  tankCode: string
): string | null {
  return dispensers.find((d) => d.tankCode === tankCode)?.fuelType ?? null
}
