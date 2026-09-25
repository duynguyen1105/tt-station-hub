import { describe, expect, it } from 'vitest'

import { tankCodeFor } from '@/lib/dispensers/naming'
import { dipFuel, tankFuelFrom } from '@/lib/inventory/tank-fuel'

describe('tankFuelFrom', () => {
  const dispensers = [
    { fuelType: 'DO', tankLinks: [{ tank: { code: 'HAM_3' } }, { tank: { code: 'HAM_4' } }] },
    { fuelType: 'URE', tankLinks: [] },
  ]

  it('finds the nhiên liệu through any of a trụ’s linked hầm', () => {
    expect(tankFuelFrom(dispensers, tankCodeFor(3))).toBe('DO')
    expect(tankFuelFrom(dispensers, tankCodeFor(4))).toBe('DO')
  })

  it('knows nothing about a hầm no active trụ draws from', () => {
    expect(tankFuelFrom(dispensers, tankCodeFor(5))).toBeNull()
  })
})

describe('dipFuel', () => {
  const configured = new Map([['HAM_1', 'XANG_E0']])

  it('shows what Cấu hình says the hầm holds, over what the dip was stamped with', () => {
    expect(dipFuel(configured, tankCodeFor(1), 'DAU_DO')).toBe('XANG_E0')
  })

  it('falls back to the dip’s own nhiên liệu for a hầm Cấu hình does not know', () => {
    expect(dipFuel(configured, tankCodeFor(4), 'DAU_DO')).toBe('DAU_DO')
    expect(dipFuel(configured, tankCodeFor(4), null)).toBeNull()
  })
})
