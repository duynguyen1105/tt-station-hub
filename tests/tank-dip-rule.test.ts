import { describe, expect, it } from 'vitest'

import { compareDipToPrevious, planDipRewire } from '@/lib/inventory/tank-dip-rule'

describe('compareDipToPrevious', () => {
  it('keeps the first measurement blank, not zero', () => {
    expect(compareDipToPrevious({ dipValue: 677, previousDipValue: null })).toEqual({
      deltaFromPrevious: null,
    })
  })

  it('reports signed movement, including zero', () => {
    expect(compareDipToPrevious({ dipValue: 300, previousDipValue: 500 })).toEqual({
      deltaFromPrevious: -200,
    })
    expect(compareDipToPrevious({ dipValue: 690, previousDipValue: 677 })).toEqual({
      deltaFromPrevious: 13,
    })
    expect(compareDipToPrevious({ dipValue: 677, previousDipValue: 677 })).toEqual({
      deltaFromPrevious: 0,
    })
  })
})

describe('planDipRewire', () => {
  const dip = (id: string, dipValue: number) => ({ id, dipValue })
  const empty = { previous: null, next: null }

  it('leaves the rest of the hầm alone when this was the last đo', () => {
    const chain = { previous: dip('a', 500), next: null }
    const plan = planDipRewire({
      self: { dipValue: 460 },
      from: chain,
      to: chain,
      movedTank: false,
    })
    expect(plan).toEqual({ self: { deltaFromPrevious: -40 }, neighbours: [] })
  })

  it('updates the next đo when a measured value is repaired', () => {
    const chain = { previous: dip('a', 500), next: dip('c', 400) }
    const plan = planDipRewire({
      self: { dipValue: 460 },
      from: chain,
      to: chain,
      movedTank: false,
    })
    expect(plan).toEqual({
      self: { deltaFromPrevious: -40 },
      neighbours: [{ id: 'c', deltaFromPrevious: -60 }],
    })
  })

  it('closes the old chain and opens the new one when moving hầm', () => {
    const plan = planDipRewire({
      self: { dipValue: 460 },
      from: { previous: dip('a', 500), next: dip('c', 400) },
      to: { previous: dip('x', 700), next: dip('z', 450) },
      movedTank: true,
    })
    expect(plan).toEqual({
      self: { deltaFromPrevious: -240 },
      neighbours: [
        { id: 'c', deltaFromPrevious: -100 },
        { id: 'z', deltaFromPrevious: -10 },
      ],
    })
  })

  it('blanks an orphan’s comparison when its predecessor leaves', () => {
    const plan = planDipRewire({
      self: { dipValue: 460 },
      from: { previous: null, next: dip('c', 400) },
      to: empty,
      movedTank: true,
    })
    expect(plan).toEqual({
      self: { deltaFromPrevious: null },
      neighbours: [{ id: 'c', deltaFromPrevious: null }],
    })
  })
})
