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

// Every case below is a real pump display from the 24/08 Trường Thịnh bug report.
describe('resolveLiters (implied-decimal resolution)', () => {
  it('resolves the 4-implied-decimal convention via the money line', () => {
    // 50H-357.56: display 90000 = 9.0000 L × 29,110 = 261,990 (AI had said 90.00)
    expect(resolveLiters('90000', 29110, '261990')).toEqual({
      liters: 9,
      resolution: 'rescaled',
    })
    // 50H-212.30: 150000 = 15.0000 L × 29,110 = 436,650
    expect(resolveLiters('150000', 29110, '436650')).toEqual({
      liters: 15,
      resolution: 'rescaled',
    })
    // 60C-244.10: 68000 = 6.8000 L × 28,540 = 194,072
    expect(resolveLiters('68000', 28540, '194072')).toEqual({
      liters: 6.8,
      resolution: 'rescaled',
    })
  })
  it('resolves through display truncation of the money line', () => {
    // 50E-751.91 / 50E-657.51: 350000 = 35.0000 L × 29,110 = 1,018,850, shown truncated as 101885
    expect(resolveLiters('350000', 29110, '101885')).toEqual({
      liters: 35,
      resolution: 'rescaled',
    })
  })
  it('trusts a visible dot that reconciles', () => {
    expect(resolveLiters('4.3', 27760, '119368')).toEqual({ liters: 4.3, resolution: 'verified' })
  })
  it('rescales even against a wrongly-dotted read when arithmetic disagrees', () => {
    // model wrote "90.00" despite no lit dot — money line says 9.00
    expect(resolveLiters('90.00', 29110, '261990')).toEqual({
      liters: 9,
      resolution: 'rescaled',
    })
  })
  it('falls back to the 4-decimal assumption, flagged unverified, when nothing reconciles', () => {
    expect(resolveLiters('350000', null, null)).toEqual({ liters: 35, resolution: 'unverified' })
    expect(resolveLiters('350000', 29110, null)).toEqual({ liters: 35, resolution: 'unverified' })
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
