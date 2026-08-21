// A RESERVE tank (no dispenser draws from it) holds still between dips, so any
// real movement is evaporation-scale. Trường Thịnh's rule: warn when the dip
// changes "too much" versus the previous measurement. The dip unit is whatever
// the station writes (cm on the stick until the barem table lands), so the
// tolerance is relative with a small absolute floor for near-empty tanks.

export const RESERVE_DIP_TOLERANCE_PCT = 5
export const RESERVE_DIP_TOLERANCE_MIN = 2

export function reserveDipExceedsTolerance(previous: number, next: number): boolean {
  const tolerance = Math.max(
    (Math.abs(previous) * RESERVE_DIP_TOLERANCE_PCT) / 100,
    RESERVE_DIP_TOLERANCE_MIN
  )
  return Math.abs(next - previous) > tolerance
}

/** The one anomalyReason a đo hầm can carry. */
export const RESERVE_STOCK_CHANGED = 'reserve_stock_changed'

export type DipComparison = {
  deltaFromPrevious: number | null
  isAnomaly: boolean
  anomalyReason: string | null
}

/**
 * What a số đo means beside the one before it: the movement, and whether a hầm dự
 * phòng moved further than evaporation explains.
 *
 * Pure, and shared by the ingest that first records a đo hầm and the correction
 * that repairs a misread one — so a retyped số đo lands with exactly the derived
 * fields a correct AI read would have left behind, instead of the two write sites
 * drifting apart.
 */
export function compareDipToPrevious(params: {
  dipValue: number
  /** The last dip anyone still stands behind, or null when this is the hầm's first. */
  previousDipValue: number | null
  isReserve: boolean
}): DipComparison {
  const { dipValue, previousDipValue, isReserve } = params
  const deltaFromPrevious = previousDipValue === null ? null : dipValue - previousDipValue
  const isAnomaly =
    isReserve && previousDipValue !== null && reserveDipExceedsTolerance(previousDipValue, dipValue)
  return { deltaFromPrevious, isAnomaly, anomalyReason: isAnomaly ? RESERVE_STOCK_CHANGED : null }
}

/** A neighbouring đo hầm, reduced to what a re-derivation needs of it. */
export type ChainDip = { id: string; dipValue: number; isReserve: boolean }

/** The dips either side of the one being corrected, within one hầm's chain. */
export type ChainSide = { previous: ChainDip | null; next: ChainDip | null }

export type DipRewire = { id: string } & DipComparison

/**
 * Which rows a đo hầm correction moves, and what each one now compares to.
 *
 * "So với lần trước" is a chain: every dip looks one step back within its own
 * hầm. Retyping a số đo therefore disturbs two links — this dip's and the next
 * one's. Moving a dip to a different hầm disturbs a third, because the hầm it
 * left has to close over the gap: the dip that followed it there now follows
 * whatever came before it.
 *
 * Nothing further down either chain moves. Each row only ever looks one step
 * back, so the rewired neighbours still answer the same question they did.
 *
 * Pure, and deliberately so — `applyDipCorrection` fetches the four neighbours
 * and writes the answer, and this decides what the answer is.
 */
export function planDipRewire(params: {
  self: { dipValue: number; isReserve: boolean }
  /** The chain the dip is leaving. Ignored unless `movedTank`. */
  from: ChainSide
  /** The chain it lands in — the same dips as `from` when the hầm did not change. */
  to: ChainSide
  movedTank: boolean
}): { self: DipComparison; neighbours: DipRewire[] } {
  const { self, from, to, movedTank } = params

  // Keyed by id so an unmoved correction, where `from.next` and `to.next` are the
  // same row, can never emit two updates for it.
  const neighbours = new Map<string, DipRewire>()

  // The hầm this dip left closes over the gap.
  if (movedTank && from.next) {
    neighbours.set(from.next.id, {
      id: from.next.id,
      ...compareDipToPrevious({
        dipValue: from.next.dipValue,
        previousDipValue: from.previous?.dipValue ?? null,
        isReserve: from.next.isReserve,
      }),
    })
  }

  // The hầm it is in now: the dip after it follows this value.
  if (to.next) {
    neighbours.set(to.next.id, {
      id: to.next.id,
      ...compareDipToPrevious({
        dipValue: to.next.dipValue,
        previousDipValue: self.dipValue,
        isReserve: to.next.isReserve,
      }),
    })
  }

  return {
    self: compareDipToPrevious({
      dipValue: self.dipValue,
      previousDipValue: to.previous?.dipValue ?? null,
      isReserve: self.isReserve,
    }),
    neighbours: [...neighbours.values()],
  }
}
