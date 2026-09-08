import { describe, expect, it } from 'vitest'

import { tankCodeFor } from '@/lib/dispensers/naming'
import { tankFuelFrom } from '@/lib/inventory/tank-fuel'

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
