// How the Hầm table is filled from the trụ that already name a hầm (ADR 0006). Pure —
// the rows in, a plan out — so what `pnpm db:tanks` would write can be tested without a
// database. The script only carries the plan out.

/** A trụ that names a hầm by code but is not yet attached to a Hầm row. */
export type UnattachedDispenser = {
  id: string
  stationId: string
  displayName: string
  tankCode: string
  fuelType: string
  tankCapacityK: number | null
}

/** A Hầm row that already exists — from a previous run, or made on the config page. */
export type ExistingTank = {
  id: string
  stationId: string
  code: string
  fuelType: string
  capacityK: number | null
}

export type TankBackfillPlan = {
  /** Hầm to create, with the trụ that attach to each. */
  creates: {
    stationId: string
    code: string
    fuelType: string
    capacityK: number | null
    dispenserIds: string[]
  }[]
  /**
   * Trụ that attach to a Hầm row already there, with the dung tích the hầm ends up with —
   * the row's own, or the trụ's when the row has none.
   */
  attaches: { tankId: string; capacityK: number | null; dispenserIds: string[] }[]
  /**
   * Hầm whose trụ disagree — on nhiên liệu, or on a dung tích both state — with each
   * other or with the Hầm row. Reported and left alone, in the posture of ADR 0003: the
   * plan never picks which trụ is right.
   */
  conflicts: { stationId: string; code: string; detail: string }[]
}

/**
 * The plan for every (trạm, hầm code) the unattached trụ name. A dung tích only one
 * side states is no disagreement — the hầm takes the one that is known, and every trụ
 * is then rewritten with it.
 */
export function planTankBackfill(
  dispensers: readonly UnattachedDispenser[],
  tanks: readonly ExistingTank[]
): TankBackfillPlan {
  const plan: TankBackfillPlan = { creates: [], attaches: [], conflicts: [] }

  const groups = new Map<
    string,
    { stationId: string; code: string; group: UnattachedDispenser[] }
  >()
  for (const d of dispensers) {
    const key = `${d.stationId}|${d.tankCode}`
    const entry = groups.get(key) ?? { stationId: d.stationId, code: d.tankCode, group: [] }
    entry.group.push(d)
    groups.set(key, entry)
  }

  for (const { stationId, code, group } of groups.values()) {
    const existing = tanks.find((t) => t.stationId === stationId && t.code === code)

    const fuels = new Set(group.map((d) => d.fuelType))
    const capacities = new Set(
      group.flatMap((d) => (d.tankCapacityK === null ? [] : [d.tankCapacityK]))
    )
    if (existing) {
      fuels.add(existing.fuelType)
      if (existing.capacityK !== null) capacities.add(existing.capacityK)
    }

    if (fuels.size > 1 || capacities.size > 1) {
      const pumps = group
        .map(
          (d) =>
            `${d.displayName} ${d.fuelType}${d.tankCapacityK === null ? '' : ` ${d.tankCapacityK}K`}`
        )
        .join(', ')
      const row = existing
        ? `; hầm đã có: ${existing.fuelType}${existing.capacityK === null ? '' : ` ${existing.capacityK}K`}`
        : ''
      plan.conflicts.push({ stationId, code, detail: `${pumps}${row}` })
      continue
    }

    const dispenserIds = group.map((d) => d.id)
    const [fuelType] = fuels
    const [capacityK = null] = capacities
    if (existing) {
      plan.attaches.push({ tankId: existing.id, capacityK, dispenserIds })
    } else if (fuelType !== undefined) {
      plan.creates.push({ stationId, code, fuelType, capacityK, dispenserIds })
    }
  }

  return plan
}
