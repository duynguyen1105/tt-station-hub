import { describe, expect, it } from 'vitest'

import { isManualMovement, manualMovementDeltas } from '@/lib/inventory/manual-movement'

describe('manual movement reconciliation', () => {
  it('reverses the old fuel and applies the replacement without losing decimal precision', () => {
    const old = { fuelType: 'RON95', quantity: '10.125' }
    expect(
      manualMovementDeltas(old, { fuelType: 'DO', quantity: '-2.375' }).map(([fuel, delta]) => [
        fuel,
        delta.toString(),
      ])
    ).toEqual([
      ['RON95', '-10.125'],
      ['DO', '-2.375'],
    ])
    expect(
      manualMovementDeltas(old, { fuelType: 'RON95', quantity: '8.625' }).map(([fuel, delta]) => [
        fuel,
        delta.toString(),
      ])
    ).toEqual([['RON95', '-1.5']])
    expect(
      manualMovementDeltas(old, null).map(([fuel, delta]) => [fuel, delta.toString()])
    ).toEqual([['RON95', '-10.125']])
  })

  it('never hands movements owned by an automated flow to an admin editor', () => {
    expect(isManualMovement({ sourceRef: null, createdBy: 'admin' })).toBe(true)
    expect(isManualMovement({ sourceRef: 'shift-or-import-id', createdBy: 'admin' })).toBe(false)
    expect(isManualMovement({ sourceRef: null, createdBy: null })).toBe(false)
  })
})
