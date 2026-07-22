import { describe, expect, it } from 'vitest'

import { shiftDayWindow } from '@/lib/misa-export/debts-list'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

// shiftDate is UTC-midnight labelled with the Vietnam (GMT+7) calendar day.
const SHIFT_DATE = new Date('2026-06-27T00:00:00.000Z')

describe('shiftDayWindow', () => {
  it('starts 7h before the labelled UTC-midnight (Vietnam day start)', () => {
    const { start } = shiftDayWindow(SHIFT_DATE)
    expect(start.getTime()).toBe(SHIFT_DATE.getTime() - 7 * HOUR_MS)
  })

  it('ends 17h after the labelled UTC-midnight (24h later, offset back 7h)', () => {
    const { end } = shiftDayWindow(SHIFT_DATE)
    expect(end.getTime()).toBe(SHIFT_DATE.getTime() + 17 * HOUR_MS)
  })

  it('spans exactly 24h', () => {
    const { start, end } = shiftDayWindow(SHIFT_DATE)
    expect(end.getTime() - start.getTime()).toBe(DAY_MS)
  })

  it('includes a visitDate exactly at the start (half-open lower bound)', () => {
    const { start, end } = shiftDayWindow(SHIFT_DATE)
    const at = start.getTime()
    expect(at >= start.getTime() && at < end.getTime()).toBe(true)
  })

  it('excludes a visitDate 1ms before the start', () => {
    const { start, end } = shiftDayWindow(SHIFT_DATE)
    const before = start.getTime() - 1
    expect(before >= start.getTime() && before < end.getTime()).toBe(false)
  })

  it('includes a visitDate 1ms before the end', () => {
    const { start, end } = shiftDayWindow(SHIFT_DATE)
    const justInside = end.getTime() - 1
    expect(justInside >= start.getTime() && justInside < end.getTime()).toBe(true)
  })

  it('excludes a visitDate exactly at the end (half-open upper bound)', () => {
    const { start, end } = shiftDayWindow(SHIFT_DATE)
    const at = end.getTime()
    expect(at >= start.getTime() && at < end.getTime()).toBe(false)
  })
})
