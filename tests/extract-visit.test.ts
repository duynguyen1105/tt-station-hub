import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { checkAmountMatch, extractVisitMeter, parseNumericString } from '@/lib/ai/extract-visit'

describe('parseNumericString', () => {
  it('parses decimals, thousands separators, and rejects junk', () => {
    expect(parseNumericString('4.3')).toBe(4.3)
    expect(parseNumericString('27,760')).toBe(27760)
    expect(parseNumericString('')).toBeNull()
    expect(parseNumericString(null)).toBeNull()
  })
})

describe('checkAmountMatch (anti-truncation §5.6)', () => {
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
  it('rejects a null/empty displayed value', () => {
    expect(checkAmountMatch(119368, null)).toBe(false)
    expect(checkAmountMatch(119368, 'abc')).toBe(false)
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
