import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  checkAmountMatch,
  extractVisitMeter,
  parseNumericString,
  resolveLiters,
} from '@/lib/ai/extract-visit'

describe('parseNumericString', () => {
  it('parses decimals, thousands separators, and rejects junk', () => {
    expect(parseNumericString('4.3')).toBe(4.3)
    expect(parseNumericString('27,760')).toBe(27760)
    expect(parseNumericString('')).toBeNull()
    expect(parseNumericString(null)).toBeNull()
  })
})

describe('checkAmountMatch (anti-truncation §5.6, gated)', () => {
  it('matches exactly', () => {
    expect(checkAmountMatch(119368, '119368')).toBe(true)
  })
  it('matches when the meter drops the units digit on large totals', () => {
    expect(checkAmountMatch(1193680, '119368')).toBe(true)
  })
  it('matches when it drops the tens digit above ~10M', () => {
    expect(checkAmountMatch(11936800, '119368')).toBe(true)
  })
  it('rejects a 10x mismatch (the 4.3 L vs 43 L §12.2 ambiguity)', () => {
    // liters misread as 4.3 -> computed 119,368 cannot reconcile with a displayed 1,193,680
    expect(checkAmountMatch(119368, '1193680')).toBe(false)
  })
  it('rejects truncation candidates below the display-overflow threshold', () => {
    // 24/08 live bug: liters misread 90.00 (true 9.00) -> computed 2,619,900;
    // the ungated /10 candidate made it "match" the displayed 261,990.
    // Sub-1M computed amounts never overflow the cells, so /10 must not apply:
    expect(checkAmountMatch(261990 * 10, '261990')).toBe(true) // ≥1M: genuine truncation stays accepted
    expect(checkAmountMatch(261990, '26199')).toBe(false) // <1M: no truncation possible
    expect(checkAmountMatch(999999, '99999')).toBe(false)
  })
  it('rejects a null/empty displayed value', () => {
    expect(checkAmountMatch(119368, null)).toBe(false)
    expect(checkAmountMatch(119368, 'abc')).toBe(false)
  })
})

// Every display below is a real pump read from a Trường Thịnh bug report
// (24/08 and 26–28/08). The money row truncates above 1,000,000 đ, so it cannot
// tell 34 L from 340 L on its own — the trạm's convention (default 3 implied
// decimals) or a lit dot decides, and the money row only confirms.
describe('resolveLiters (implied-decimal resolution)', () => {
  it('places 3 implied decimals and confirms through money-row truncation (26/08)', () => {
    // 50H-210.10 DAKNONG1: 340000 = 340.000 L × 29,110 = 9,897,400 shown as 989740
    expect(resolveLiters('340000', 29110, '989740')).toEqual({
      liters: 340,
      resolution: 'verified',
    })
    // 59000 = 59.000 L × 28,540 = 1,683,860 shown as 168386
    expect(resolveLiters('59000', 28540, '168386')).toEqual({
      liters: 59,
      resolution: 'verified',
    })
    // 170000 = 170.000 L × 28,540 = 4,851,800 shown as 485180
    expect(resolveLiters('170000', 28540, '485180')).toEqual({
      liters: 170,
      resolution: 'verified',
    })
  })
  it('trusts a dot the reader actually saw over the convention', () => {
    // 50F-032.52 LAMDONG01: "182.000" lit on the glass × 29,110 = 5,298,020 shown as 529802
    expect(resolveLiters('182.000', 29110, '529802')).toEqual({
      liters: 182,
      resolution: 'verified',
    })
    // A dotted read on a 4-decimal trạm still wins when it reconciles
    expect(resolveLiters('182.000', 29110, '529802', 4)).toEqual({
      liters: 182,
      resolution: 'verified',
    })
    expect(resolveLiters('4.3', 27760, '119368')).toEqual({ liters: 4.3, resolution: 'verified' })
  })
  it('honours a trạm configured with 4 implied decimals (24/08 displays)', () => {
    // 50H-357.56: 90000 = 9.0000 L × 29,110 = 261,990
    expect(resolveLiters('90000', 29110, '261990', 4)).toEqual({
      liters: 9,
      resolution: 'verified',
    })
    // 50E-751.91: 350000 = 35.0000 L × 29,110 = 1,018,850 shown as 101885
    expect(resolveLiters('350000', 29110, '101885', 4)).toEqual({
      liters: 35,
      resolution: 'verified',
    })
    // The same digits under the default convention read ten times larger
    expect(resolveLiters('90000', 29110, '261990')).toEqual({
      liters: 90,
      resolution: 'verified',
    })
  })
  it('flags a read that only reconciles at a scale the trạm does not use', () => {
    // Reader lost two zeros of "340000": 3400 × 29,110 only adds up as 34 L (2 decimals)
    expect(resolveLiters('3400', 29110, '989740')).toEqual({
      liters: 34,
      resolution: 'rescaled',
    })
  })
  it('falls back to the convention, flagged unverified, when nothing reconciles', () => {
    expect(resolveLiters('350000', null, null)).toEqual({ liters: 350, resolution: 'unverified' })
    expect(resolveLiters('350000', 29110, null)).toEqual({ liters: 350, resolution: 'unverified' })
    expect(resolveLiters('350000', null, null, 4)).toEqual({ liters: 35, resolution: 'unverified' })
    // Too short to carry the implied decimals: kept whole
    expect(resolveLiters('43', null, null)).toEqual({ liters: 43, resolution: 'unverified' })
  })
  it('keeps a dotted literal, flagged unverified, when it cannot be checked', () => {
    expect(resolveLiters('32.00', null, null)).toEqual({ liters: 32, resolution: 'unverified' })
  })
  it('returns null for junk', () => {
    expect(resolveLiters(null, 29110, '261990')).toEqual({ liters: null, resolution: null })
    expect(resolveLiters('--', 29110, '261990')).toEqual({ liters: null, resolution: null })
  })
})

describe('extractVisitMeter in AI_MOCK mode', () => {
  beforeEach(() => {
    process.env.AI_MOCK = 'true'
  })
  afterEach(() => {
    delete process.env.AI_MOCK
  })
  it('computes amount from liters x unit price and matches the display', async () => {
    const result = await extractVisitMeter({})
    expect(result.computedAmount).toBe(1193680)
    expect(result.amountMatchesDisplay).toBe(true)
    expect(result.meterType).toBe('debt_meter')
  })
})
