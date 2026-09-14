import { describe, expect, it } from 'vitest'

import {
  dispenserFuelOptions,
  noTankFieldsFor,
  refuseDispenserShape,
  tankFieldsFor,
} from '@/lib/dispensers/rules'
import { vi } from '@/messages/vi'

describe('tankFieldsFor', () => {
  const tank = { id: 't3', code: 'HAM_3', fuelType: 'DO', capacityK: 25 }

  it('copies the hầm onto the trụ: its nhiên liệu, its code and its dung tích', () => {
    expect(tankFieldsFor(tank)).toEqual({
      tankId: 't3',
      fuelType: 'DO',
      tankCode: 'HAM_3',
      tankCapacityK: 25,
    })
  })

  it('copies a dung tích nobody knows as not known', () => {
    expect(tankFieldsFor({ ...tank, capacityK: null })).toMatchObject({ tankCapacityK: null })
  })
})

describe('noTankFieldsFor', () => {
  it('leaves a trụ drawing from no hầm with its own nhiên liệu and no hầm columns', () => {
    expect(noTankFieldsFor('URE')).toEqual({
      tankId: null,
      fuelType: 'URE',
      tankCode: null,
      tankCapacityK: null,
    })
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
