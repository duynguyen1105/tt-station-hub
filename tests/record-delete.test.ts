import { describe, expect, it } from 'vitest'

import { type ChainSide, planDipRewire } from '@/lib/inventory/tank-dip-rule'

const deletedDipNeighbours = (from: ChainSide) =>
  planDipRewire({
    self: { dipValue: 900 },
    from,
    to: { previous: null, next: null },
    movedTank: true,
  }).neighbours

describe('deleting a countable tank dip', () => {
  it('makes the next measurement compare with the one before the deleted dip', () => {
    expect(
      deletedDipNeighbours({
        previous: { id: 'before', dipValue: 500 },
        next: { id: 'after', dipValue: 470 },
      })
    ).toEqual([{ id: 'after', deltaFromPrevious: -30 }])
  })

  it('leaves the first remaining measurement without a comparison', () => {
    expect(deletedDipNeighbours({ previous: null, next: { id: 'after', dipValue: 470 } })).toEqual([
      { id: 'after', deltaFromPrevious: null },
    ])
  })

  it('does not update a neighbour if the deleted measurement was last', () => {
    expect(deletedDipNeighbours({ previous: { id: 'before', dipValue: 500 }, next: null })).toEqual(
      []
    )
  })
})
