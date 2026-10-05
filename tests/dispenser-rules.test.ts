import { describe, expect, it } from 'vitest'

import {
  dispenserFuelFor,
  dispenserFuelOptions,
  refuseDispenserShape,
  refuseMeterPatch,
} from '@/lib/dispensers/rules'
import { vi } from '@/messages/vi'

describe('dispenserFuelFor', () => {
  it('refuses hầm holding different nhiên liệu', () => {
    expect(dispenserFuelFor([{ fuelType: 'DO' }, { fuelType: 'E0' }], null)).toEqual({
      refusal: vi.dispensers.tanksMixedFuel,
    })
  })

  it('pumps the shared fuel of all chosen hầm instead of the submitted fuel', () => {
    expect(dispenserFuelFor([{ fuelType: 'DO' }, { fuelType: 'DO' }], 'E0')).toEqual({
      fuelType: 'DO',
    })
  })

  it('requires a fuel with no hầm, then pumps it', () => {
    expect(dispenserFuelFor([], null)).toEqual({ refusal: vi.dispensers.fuelRequired })
    expect(dispenserFuelFor([], 'URE')).toEqual({ fuelType: 'URE' })
  })
})

describe('refuseDispenserShape', () => {
  it('writes a trụ with both đồng hồ', () => {
    expect(refuseDispenserShape({ hasElectronicMeter: true, hasMechanicalMeter: true })).toBeNull()
  })

  it('writes a trụ with only one đồng hồ', () => {
    expect(refuseDispenserShape({ hasElectronicMeter: true, hasMechanicalMeter: false })).toBeNull()
    expect(refuseDispenserShape({ hasElectronicMeter: false, hasMechanicalMeter: true })).toBeNull()
  })

  it('refuses a trụ with no đồng hồ at all — no ca would ever ask it for anything', () => {
    expect(refuseDispenserShape({ hasElectronicMeter: false, hasMechanicalMeter: false })).toBe(
      vi.dispensers.meterRequired
    )
  })
})

describe('dispenserFuelOptions', () => {
  const sold = [
    { fuelType: 'DO', name: 'Dầu DO' },
    { fuelType: 'DC', name: 'Dầu DC' },
  ]

  it('offers what the trạm sells when the trụ is being lắp', () => {
    expect(dispenserFuelOptions(sold)).toEqual(sold)
  })

  it('offers what the trạm sells when the trụ already pumps one of them', () => {
    expect(dispenserFuelOptions(sold, { fuelType: 'DO', name: 'Dầu DO' })).toEqual(sold)
  })

  it('keeps the trụ’s own nhiên liệu on offer when the trạm no longer sells it', () => {
    expect(dispenserFuelOptions(sold, { fuelType: 'E5', name: 'Xăng E5' })).toEqual([
      ...sold,
      { fuelType: 'E5', name: 'Xăng E5' },
    ])
  })
})

describe('refuseMeterPatch', () => {
  const electronicOnly = { hasElectronicMeter: true, hasMechanicalMeter: false }
  const mechanicalOnly = { hasElectronicMeter: false, hasMechanicalMeter: true }

  it('writes a chỉ số on a đồng hồ the trụ has', () => {
    expect(refuseMeterPatch(electronicOnly, { electronicReading: '11761.4' })).toBeNull()
    expect(refuseMeterPatch(mechanicalOnly, { openingMechanicalReading: '100' })).toBeNull()
  })

  it('refuses a chỉ số on a đồng hồ the trụ does not have', () => {
    expect(refuseMeterPatch(electronicOnly, { mechanicalReading: '5' })).toBe(
      vi.dispensers.noMechanicalMeter
    )
    expect(refuseMeterPatch(electronicOnly, { openingMechanicalReading: '5' })).toBe(
      vi.dispensers.noMechanicalMeter
    )
    expect(refuseMeterPatch(mechanicalOnly, { electronicReading: '5' })).toBe(
      vi.dispensers.noElectronicMeter
    )
  })

  it('lets a leftover chỉ số on a missing đồng hồ be cleared', () => {
    expect(refuseMeterPatch(electronicOnly, { mechanicalReading: null })).toBeNull()
  })
})
