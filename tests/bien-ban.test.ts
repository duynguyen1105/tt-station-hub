import { describe, expect, it } from 'vitest'

import { parseVnNumber, tankCodeFromLabel } from '@/lib/imports/bien-ban'

describe('parseVnNumber', () => {
  it('passes plain numbers through', () => {
    expect(parseVnNumber(6000)).toBe(6000)
    expect(parseVnNumber(34.5)).toBe(34.5)
    expect(parseVnNumber(null)).toBeNull()
    expect(parseVnNumber(undefined)).toBeNull()
  })

  it('reads Vietnamese thousands separators (dot or comma + 3 digits)', () => {
    // Real cells from the Nguyên Vượng biên bản
    expect(parseVnNumber('6.000')).toBe(6000)
    expect(parseVnNumber('109,622')).toBe(109622)
    expect(parseVnNumber('494,071')).toBe(494071)
    expect(parseVnNumber('226,760')).toBe(226760)
    expect(parseVnNumber('1.037.500')).toBe(1037500)
  })

  it('reads 1-2 trailing digits as decimals', () => {
    // Real cells from the Phúc Tiến biên bản (electronic totals with decimals)
    expect(parseVnNumber('34,5')).toBe(34.5)
    expect(parseVnNumber('82118,87')).toBe(82118.87)
    expect(parseVnNumber('141008,78')).toBe(141008.78)
    expect(parseVnNumber('407455,70')).toBe(407455.7)
    expect(parseVnNumber('0,5')).toBe(0.5)
  })

  it('uses the last separator as decimal when both appear', () => {
    expect(parseVnNumber('141.008,78')).toBe(141008.78)
    expect(parseVnNumber('141,008.78')).toBe(141008.78)
    expect(parseVnNumber('259.799,74')).toBe(259799.74)
  })

  it('keeps signs and strips units/spaces', () => {
    expect(parseVnNumber('-2')).toBe(-2)
    expect(parseVnNumber('+0,5')).toBe(0.5)
    expect(parseVnNumber('38°C')).toBe(38)
    expect(parseVnNumber(' 645 ')).toBe(645)
  })

  it('rejects garbage instead of guessing', () => {
    expect(parseVnNumber('')).toBeNull()
    expect(parseVnNumber('abc')).toBeNull()
    expect(parseVnNumber('12a')).toBeNull()
  })
})

describe('tankCodeFromLabel', () => {
  it('normalizes paper tank labels to canonical codes', () => {
    expect(tankCodeFromLabel('HẦM 2 12K')).toEqual({ code: 'HAM_2', capacityK: 12 })
    expect(tankCodeFromLabel('HẦM 1 25K')).toEqual({ code: 'HAM_1', capacityK: 25 })
    expect(tankCodeFromLabel('Hầm 03')).toEqual({ code: 'HAM_3', capacityK: null })
    expect(tankCodeFromLabel('HAM 3 6K')).toEqual({ code: 'HAM_3', capacityK: 6 })
  })

  it('handles fuel-suffix labels from the Phúc Tiến layout', () => {
    expect(tankCodeFromLabel('HẦM 1 XA')?.code).toBe('HAM_1')
    expect(tankCodeFromLabel('HẦM 2 DC')?.code).toBe('HAM_2')
    expect(tankCodeFromLabel('HẦM 3 DO')?.code).toBe('HAM_3')
  })

  it('returns null when there is no tank number', () => {
    expect(tankCodeFromLabel('TRỤ 2')).toBeNull()
  })
})
