import { describe, expect, it } from 'vitest'

import { reserveDipExceedsTolerance } from '@/lib/inventory/tank-dip-rule'

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
