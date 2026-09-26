import { describe, expect, it } from 'vitest'

import { importStockDeltas } from '@/lib/imports/reconcile'

const before = { stationId: 'a', fuelType: 'DO', liters: 100 }

describe('edited import stock deltas', () => {
  it('increments or decrements the existing fuel exactly once', () => {
    expect(importStockDeltas(before, { ...before, liters: 120 })).toEqual([
      { stationId: 'a', fuelType: 'DO', liters: 20 },
    ])
    expect(importStockDeltas(before, { ...before, liters: 70 })).toEqual([
      { stationId: 'a', fuelType: 'DO', liters: -30 },
    ])
  })

  it('does not change stock when liters and fuel key are unchanged', () => {
    expect(importStockDeltas(before, { ...before })).toEqual([])
  })

  it('reverses the old fuel and books the new one when hầm changes fuel', () => {
    expect(importStockDeltas(before, { ...before, fuelType: 'E0', liters: 90 })).toEqual([
      { stationId: 'a', fuelType: 'DO', liters: -100 },
      { stationId: 'a', fuelType: 'E0', liters: 90 },
    ])
  })

  it('reverses and books across station keys too', () => {
    expect(importStockDeltas(before, { ...before, stationId: 'b' })).toEqual([
      { stationId: 'a', fuelType: 'DO', liters: -100 },
      { stationId: 'b', fuelType: 'DO', liters: 100 },
    ])
  })
})
