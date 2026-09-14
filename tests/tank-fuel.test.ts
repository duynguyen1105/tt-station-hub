import { describe, expect, it } from 'vitest'

import { tankCodeFor } from '@/lib/dispensers/naming'
import { dipFuel, tankFuelFrom } from '@/lib/inventory/tank-fuel'

describe('tankFuelFrom', () => {
  const dispensers = [
    { tankCode: 'HAM_3', fuelType: 'DO' },
    { tankCode: null, fuelType: 'URE' },
  ]

  it('names the nhiên liệu of a hầm from the trụ drawing on it', () => {
    expect(tankFuelFrom(dispensers, tankCodeFor(3))).toBe('DO')
  })

  it('knows nothing about a hầm dự phòng no trụ draws from', () => {
    expect(tankFuelFrom(dispensers, tankCodeFor(4))).toBeNull()
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
