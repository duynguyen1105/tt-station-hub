// What a hầm holds. Cấu hình states it once, on the hầm's `tanks` row, and every
// screen showing a hầm's nhiên liệu defers to that row. A hầm with no row yet —
// one seen only through its đo hầm, or a trạm whose hầm were never backfilled —
// is still answered from the trụ that draw on it, or from what its dips carry.

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

/**
 * The nhiên liệu a đo hầm row shows: what Cấu hình says its hầm holds *now*, else the
 * nhiên liệu the dip was stamped with. `configured` maps hầm code to the `tanks` row's
 * fuel. A hầm converted in Cấu hình therefore relabels its older dips too — the dip is
 * a height of liquid in that hầm, and the hầm is where its nhiên liệu is decided.
 *
 * The same rule `dipSelection` filters by, so ticking a nhiên liệu lists exactly the
 * rows that show it.
 */
export function dipFuel(
  configured: ReadonlyMap<string, string>,
  tankCode: string,
  recorded: string | null
): string | null {
  return configured.get(tankCode) ?? recorded
}
