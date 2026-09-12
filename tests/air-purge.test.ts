import { describe, expect, it } from 'vitest'

import { refuseAirPurge } from '@/lib/shifts/air-purge'
import { vi } from '@/messages/vi'

/** Trụ 1 of the screenshot: the đồng hồ điện tử counted 1,824.76 lít this ca. */
const electronicLiters = 1824.76

describe('refuseAirPurge', () => {
  it('refuses an air purge larger than the trụ pumped, and says what the limit is', () => {
    // The typo the rule exists for: 2000 keyed in for 20.
    const refusal = refuseAirPurge('2000', electronicLiters)
    expect(refusal).toBe(vi.shifts.airPurgeAboveMeter('1824.76'))
    expect(refusal).toContain('1824.76')
  })

  it('names a limit kế toán can type straight back, and then accepts it', () => {
    // Meters carry 3 decimals, so the ceiling can too — and the figure named must be one
    // this same rule allows, not a 2-decimal rounding of it that it would refuse.
    const refusal = refuseAirPurge('9999', 1824.765)
    expect(refusal).toBe(vi.shifts.airPurgeAboveMeter('1824.765'))
    expect(refuseAirPurge('1824.765', 1824.765)).toBeNull()
  })

  it('refuses an air purge a hair over the meter, not only an obvious typo', () => {
    expect(refuseAirPurge('1824.761', electronicLiters)).not.toBeNull()
  })

  it('accepts an air purge below the meter', () => {
    expect(refuseAirPurge('20', electronicLiters)).toBeNull()
  })

  it('accepts one equal to the meter — a trụ that pushed air all ca sold nothing', () => {
    expect(refuseAirPurge('1824.76', electronicLiters)).toBeNull()
  })

  it('refuses a negative air purge', () => {
    expect(refuseAirPurge('-20', electronicLiters)).toBe(vi.shifts.airPurgeNegative)
  })

  it('accepts 0 — a purge of no litres, which is not the same as no purge', () => {
    expect(refuseAirPurge('0', electronicLiters)).toBeNull()
    expect(refuseAirPurge('0', 0)).toBeNull()
  })

  it('accepts clearing the cell: no air purge is always allowed', () => {
    expect(refuseAirPurge(null, electronicLiters)).toBeNull()
    expect(refuseAirPurge(null, null)).toBeNull()
  })

  it('refuses any air purge on a trụ whose Lít ĐT cannot be computed yet', () => {
    expect(refuseAirPurge('20', null)).toBe(vi.shifts.airPurgeNoElectronicLiters)
    expect(refuseAirPurge('0', null)).toBe(vi.shifts.airPurgeNoElectronicLiters)
  })

  it('names the negative before the missing meter — that is the fault to fix', () => {
    expect(refuseAirPurge('-20', null)).toBe(vi.shifts.airPurgeNegative)
  })

  it('refuses everything above a trụ that did not move', () => {
    expect(refuseAirPurge('0.001', 0)).toBe(vi.shifts.airPurgeAboveMeter('0'))
  })

  it('refuses what the Decimal column could not hold, at the cell rather than the route', () => {
    // "1,824.76" is the grouped form kế toán reads elsewhere on the row; "1e3" and " 20 "
    // reach the column as an error rather than as an answer. Number() would take all three.
    expect(refuseAirPurge('1,824.76', electronicLiters)).toBe(vi.shifts.airPurgeNotANumber)
    expect(refuseAirPurge('1e3', electronicLiters)).toBe(vi.shifts.airPurgeNotANumber)
    expect(refuseAirPurge(' 20 ', electronicLiters)).toBe(vi.shifts.airPurgeNotANumber)
    expect(refuseAirPurge('  ', electronicLiters)).toBe(vi.shifts.airPurgeNotANumber)
    expect(refuseAirPurge('hai mươi', electronicLiters)).toBe(vi.shifts.airPurgeNotANumber)
  })
})
