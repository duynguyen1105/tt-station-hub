import { describe, expect, it } from 'vitest'

import { refuseDispenserShape, tankFieldsFor } from '@/lib/dispensers/rules'
import { vi } from '@/messages/vi'

/** A trụ the rules have nothing to say about — every case below bends one field of it. */
const base = {
  tankNumber: 3,
  tankCapacityK: 25,
  hasElectronicMeter: true,
  hasMechanicalMeter: true,
}

describe('tankFieldsFor', () => {
  it('writes the hầm code and its dung tích', () => {
    expect(tankFieldsFor(3, 25)).toEqual({ tankCode: 'HAM_3', tankCapacityK: 25 })
  })

  it('leaves a trụ drawing from no hầm with no dung tích either', () => {
    expect(tankFieldsFor(null, 25)).toEqual({ tankCode: null, tankCapacityK: null })
  })

  it('allows a hầm whose dung tích is not known', () => {
    expect(tankFieldsFor(3, null)).toEqual({ tankCode: 'HAM_3', tankCapacityK: null })
  })
})

describe('refuseDispenserShape', () => {
  it('writes a trụ with a hầm and both đồng hồ', () => {
    expect(refuseDispenserShape(base)).toBeNull()
  })

  it('writes a trụ with only one đồng hồ', () => {
    expect(refuseDispenserShape({ ...base, hasMechanicalMeter: false })).toBeNull()
    expect(refuseDispenserShape({ ...base, hasElectronicMeter: false })).toBeNull()
  })

  it('writes a trụ that draws from no hầm and claims no dung tích', () => {
    expect(refuseDispenserShape({ ...base, tankNumber: null, tankCapacityK: null })).toBeNull()
  })

  it('refuses a dung tích typed against no hầm, rather than dropping it', () => {
    expect(refuseDispenserShape({ ...base, tankNumber: null })).toBe(
      vi.dispensers.capacityWithoutTank
    )
  })

  it('refuses a trụ with no đồng hồ at all — no ca would ever ask it for anything', () => {
    expect(
      refuseDispenserShape({ ...base, hasElectronicMeter: false, hasMechanicalMeter: false })
    ).toBe(vi.dispensers.meterRequired)
  })
})
