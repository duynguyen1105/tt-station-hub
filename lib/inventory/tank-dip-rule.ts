export type DipComparison = { deltaFromPrevious: number | null }

/** So với lần trước: blank for the first đo hầm, otherwise a signed movement. */
export function compareDipToPrevious(params: {
  dipValue: number
  previousDipValue: number | null
}): DipComparison {
  return {
    deltaFromPrevious:
      params.previousDipValue === null ? null : params.dipValue - params.previousDipValue,
  }
}

/** A neighbouring đo hầm, reduced to what a re-derivation needs. */
export type ChainDip = { id: string; dipValue: number }
export type ChainSide = { previous: ChainDip | null; next: ChainDip | null }
export type DipRewire = { id: string } & DipComparison

/** Retyping moves this dip and the next; moving hầm also closes the old chain's gap. */
export function planDipRewire(params: {
  self: { dipValue: number }
  from: ChainSide
  to: ChainSide
  movedTank: boolean
}): { self: DipComparison; neighbours: DipRewire[] } {
  const { self, from, to, movedTank } = params
  const neighbours = new Map<string, DipRewire>()
  if (movedTank && from.next) {
    neighbours.set(from.next.id, {
      id: from.next.id,
      ...compareDipToPrevious({
        dipValue: from.next.dipValue,
        previousDipValue: from.previous?.dipValue ?? null,
      }),
    })
  }
  if (to.next) {
    neighbours.set(to.next.id, {
      id: to.next.id,
      ...compareDipToPrevious({ dipValue: to.next.dipValue, previousDipValue: self.dipValue }),
    })
  }
  return {
    self: compareDipToPrevious({
      dipValue: self.dipValue,
      previousDipValue: to.previous?.dipValue ?? null,
    }),
    neighbours: [...neighbours.values()],
  }
}
