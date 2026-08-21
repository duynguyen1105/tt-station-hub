import { describe, expect, it } from 'vitest'

import {
  RESERVE_STOCK_CHANGED,
  compareDipToPrevious,
  planDipRewire,
  reserveDipExceedsTolerance,
} from '@/lib/inventory/tank-dip-rule'

describe('reserveDipExceedsTolerance', () => {
  it('tolerates small drift on a reserve tank (within 5%)', () => {
    expect(reserveDipExceedsTolerance(150, 145)).toBe(false)
    expect(reserveDipExceedsTolerance(150, 155)).toBe(false)
  })

  it('flags a change beyond 5% of the previous dip', () => {
    expect(reserveDipExceedsTolerance(150, 140)).toBe(true)
    expect(reserveDipExceedsTolerance(150, 165)).toBe(true)
  })

  it('uses the absolute floor for near-empty tanks', () => {
    // 5% of 10 is 0.5, but the floor (2) keeps measurement noise quiet...
    expect(reserveDipExceedsTolerance(10, 11.5)).toBe(false)
    // ...while a real jump still trips it.
    expect(reserveDipExceedsTolerance(10, 13)).toBe(true)
  })

  it('flags any meaningful appearance of stock in an empty tank', () => {
    expect(reserveDipExceedsTolerance(0, 5)).toBe(true)
    expect(reserveDipExceedsTolerance(0, 1)).toBe(false)
  })
})

describe('compareDipToPrevious', () => {
  it("leaves So với lần trước empty on a hầm's first ever đo", () => {
    // Nothing to compare against is not the same as "it did not move": the
    // column stays blank rather than reading 0, and no dự phòng warning can be
    // justified against a hầm nobody has measured before.
    expect(
      compareDipToPrevious({ dipValue: 677, previousDipValue: null, isReserve: true })
    ).toEqual({ deltaFromPrevious: null, isAnomaly: false, anomalyReason: null })
  })

  it('reports the signed movement, so the column reads the right direction', () => {
    expect(
      compareDipToPrevious({ dipValue: 300, previousDipValue: 500, isReserve: false })
    ).toMatchObject({ deltaFromPrevious: -200 })
    expect(
      compareDipToPrevious({ dipValue: 690, previousDipValue: 677, isReserve: false })
    ).toMatchObject({ deltaFromPrevious: 13 })
  })

  it('says a hầm that did not move is 0, not blank', () => {
    expect(
      compareDipToPrevious({ dipValue: 677, previousDipValue: 677, isReserve: false })
    ).toMatchObject({ deltaFromPrevious: 0 })
  })

  it('never flags a working hầm, however far it drops', () => {
    // A hầm a trụ draws from is supposed to empty; only a dự phòng holds still.
    expect(
      compareDipToPrevious({ dipValue: 100, previousDipValue: 500, isReserve: false })
    ).toMatchObject({ isAnomaly: false, anomalyReason: null })
  })

  it('flags a hầm dự phòng that moved beyond evaporation', () => {
    expect(compareDipToPrevious({ dipValue: 165, previousDipValue: 150, isReserve: true })).toEqual(
      {
        deltaFromPrevious: 15,
        isAnomaly: true,
        anomalyReason: RESERVE_STOCK_CHANGED,
      }
    )
  })

  it('leaves a hầm dự phòng inside tolerance unflagged', () => {
    expect(
      compareDipToPrevious({ dipValue: 155, previousDipValue: 150, isReserve: true })
    ).toMatchObject({ isAnomaly: false, anomalyReason: null })
  })
})

describe('planDipRewire', () => {
  const dip = (id: string, dipValue: number, isReserve = false) => ({ id, dipValue, isReserve })
  const empty = { previous: null, next: null }

  it('leaves the rest of the hầm alone when this was the last đo', () => {
    const chain = { previous: dip('a', 500), next: null }
    const plan = planDipRewire({
      self: { dipValue: 460, isReserve: false },
      from: chain,
      to: chain,
      movedTank: false,
    })
    expect(plan.self).toMatchObject({ deltaFromPrevious: -40 })
    expect(plan.neighbours).toEqual([])
  })

  it('moves the next đo too, because it compares against the retyped value', () => {
    // The whole reason a correction touches two rows: "So với lần trước" is a
    // chain, and repairing one link moves the one hanging off it.
    const chain = { previous: dip('a', 500), next: dip('c', 400) }
    const plan = planDipRewire({
      self: { dipValue: 460, isReserve: false },
      from: chain,
      to: chain,
      movedTank: false,
    })
    expect(plan.self).toMatchObject({ deltaFromPrevious: -40 })
    expect(plan.neighbours).toEqual([
      { id: 'c', deltaFromPrevious: -60, isAnomaly: false, anomalyReason: null },
    ])
  })

  it('never writes the same row twice when the hầm did not change', () => {
    // `from` and `to` are the same chain then, so the gap-closing rewrite and the
    // follow-on rewrite both name row 'c'. Only the second is right.
    const chain = { previous: dip('a', 500), next: dip('c', 400) }
    const plan = planDipRewire({
      self: { dipValue: 460, isReserve: false },
      from: chain,
      to: chain,
      movedTank: false,
    })
    expect(plan.neighbours).toHaveLength(1)
  })

  it('closes the gap in the hầm a dip leaves and opens one where it lands', () => {
    const plan = planDipRewire({
      self: { dipValue: 460, isReserve: false },
      from: { previous: dip('a', 500), next: dip('c', 400) },
      to: { previous: dip('x', 700), next: dip('z', 450) },
      movedTank: true,
    })
    // It compares against its new hầm's previous đo, not its old one.
    expect(plan.self).toMatchObject({ deltaFromPrevious: -240 })
    expect(plan.neighbours).toEqual([
      // The hầm it left: 'c' now follows 'a' directly.
      { id: 'c', deltaFromPrevious: -100, isAnomaly: false, anomalyReason: null },
      // The hầm it joined: 'z' now follows the moved dip.
      { id: 'z', deltaFromPrevious: -10, isAnomaly: false, anomalyReason: null },
    ])
  })

  it('blanks So với lần trước when the dip lands first in its new hầm', () => {
    const plan = planDipRewire({
      self: { dipValue: 460, isReserve: false },
      from: { previous: dip('a', 500), next: null },
      to: empty,
      movedTank: true,
    })
    expect(plan.self).toMatchObject({ deltaFromPrevious: null })
    expect(plan.neighbours).toEqual([])
  })

  it('blanks the orphan left behind when the dip was its hầm’s first', () => {
    // 'c' had nothing before it but the departing dip, so its column goes back to
    // reading blank rather than keeping a delta against a dip in another hầm.
    const plan = planDipRewire({
      self: { dipValue: 460, isReserve: false },
      from: { previous: null, next: dip('c', 400) },
      to: empty,
      movedTank: true,
    })
    expect(plan.neighbours).toEqual([
      { id: 'c', deltaFromPrevious: null, isAnomaly: false, anomalyReason: null },
    ])
  })

  it('judges a rewired neighbour by its own hầm dự phòng rule', () => {
    const plan = planDipRewire({
      self: { dipValue: 460, isReserve: false },
      from: empty,
      to: { previous: null, next: dip('z', 500, true) },
      movedTank: true,
    })
    expect(plan.neighbours).toEqual([
      { id: 'z', deltaFromPrevious: 40, isAnomaly: true, anomalyReason: RESERVE_STOCK_CHANGED },
    ])
  })

  it('judges the moved dip by the hầm it is in now, not the one it left', () => {
    // isReserve arrives already re-derived for the new hầm; a dự phòng that
    // "jumped" 40 is exactly what the warning is for.
    const plan = planDipRewire({
      self: { dipValue: 540, isReserve: true },
      from: empty,
      to: { previous: dip('x', 500, true), next: null },
      movedTank: true,
    })
    expect(plan.self).toEqual({
      deltaFromPrevious: 40,
      isAnomaly: true,
      anomalyReason: RESERVE_STOCK_CHANGED,
    })
  })
})
