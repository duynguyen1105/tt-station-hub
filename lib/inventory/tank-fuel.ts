// Cấu hình's Tank row states a hầm's fuel. For an old hầm without that row,
// an active linked trụ or an earlier dip can still supply its fuel.

/** Fallback fuel from an active trụ linked to this hầm. */
export function tankFuelFrom(
  dispensers: readonly { fuelType: string; tankLinks: readonly { tank: { code: string } }[] }[],
  tankCode: string
): string | null {
  return (
    dispensers.find((d) => d.tankLinks.some((link) => link.tank.code === tankCode))?.fuelType ??
    null
  )
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
