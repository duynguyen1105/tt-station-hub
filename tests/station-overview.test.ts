import { describe, expect, it } from 'vitest'

import {
  daysOfCover,
  daysWithoutShift,
  previousMonthToDate,
  relativeChange,
  salesBetween,
} from '@/lib/stations/overview'

describe('previousMonthToDate', () => {
  it('compares a month-to-date with the same days of the month before', () => {
    expect(previousMonthToDate('2026-10-15')).toEqual({ from: '2026-09-01', to: '2026-09-15' })
  })

  it('stops at the previous month’s last day when it is shorter', () => {
    expect(previousMonthToDate('2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })

  it('reaches back into December of the year before from January', () => {
    expect(previousMonthToDate('2027-01-10')).toEqual({ from: '2026-12-01', to: '2026-12-10' })
  })
})

describe('salesBetween', () => {
  const lines = [
    { day: '2026-09-30', fuelType: 'DO', liters: 100, amount: 3_000_000 },
    { day: '2026-10-01', fuelType: 'DO', liters: 50, amount: 1_500_000 },
    { day: '2026-10-01', fuelType: 'E0', liters: 20, amount: null },
  ]

  it('counts litres with no giá bán lẻ but keeps them out of the tiền', () => {
    const total = salesBetween(lines, '2026-10-01', '2026-10-01')
    expect(total.liters).toBe(70)
    expect(total.amount).toBe(1_500_000)
    expect(total.unpricedLiters).toBe(20)
    expect(total.byFuel.get('E0')).toEqual({ liters: 20, amount: 0 })
  })

  it('includes both ends of the range', () => {
    expect(salesBetween(lines, '2026-09-30', '2026-10-01').liters).toBe(170)
  })
})

describe('daysWithoutShift', () => {
  it('lists the ngày with no ca, crossing a month end', () => {
    const shiftDays = new Set(['2026-09-29', '2026-10-01'])
    expect(daysWithoutShift(shiftDays, '2026-09-29', '2026-10-02')).toEqual([
      '2026-09-30',
      '2026-10-02',
    ])
  })
})

describe('relativeChange and daysOfCover', () => {
  it('has nothing to compare with when the earlier period sold nothing', () => {
    expect(relativeChange(5_000_000, 0)).toBeNull()
    expect(relativeChange(110, 100)).toBeCloseTo(0.1)
  })

  it('cannot say how long stock lasts with no sales or no stock', () => {
    expect(daysOfCover(1000, 0)).toBeNull()
    expect(daysOfCover(-50, 100)).toBeNull()
    expect(daysOfCover(1000, 250)).toBe(4)
  })
})
