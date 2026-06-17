import { describe, expect, it } from 'vitest'

import {
  computeEstimatedStock,
  computeVariance,
  isLowStock,
} from '@/lib/inventory/stock-calculator'

describe('computeEstimatedStock', () => {
  it('applies signed imports and sales', () => {
    expect(
      computeEstimatedStock(1000, [
        { movementType: 'import', quantity: 500 },
        { movementType: 'sale', quantity: -300 },
      ])
    ).toBe(1200)
  })
  it('resets to a physical count', () => {
    expect(
      computeEstimatedStock(1000, [
        { movementType: 'sale', quantity: -300 },
        { movementType: 'physical_count', quantity: 650 },
        { movementType: 'sale', quantity: -50 },
      ])
    ).toBe(600)
  })
})

describe('computeVariance / isLowStock', () => {
  it('computes physical minus estimated', () => {
    expect(computeVariance(680, 700)).toBe(-20)
  })
  it('flags low stock against a threshold', () => {
    expect(isLowStock(500, 1000)).toBe(true)
    expect(isLowStock(1500, 1000)).toBe(false)
    expect(isLowStock(500, null)).toBe(false)
  })
})
