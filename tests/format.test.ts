import { describe, expect, it } from 'vitest'

import { parseNumericString } from '@/lib/ai/extract-visit'
import {
  caretAfterDigits,
  formatDate,
  formatDateTime,
  formatLiters,
  formatVND,
  groupMoney,
  groupThousands,
  moneyDigits,
} from '@/lib/format'

// Company rule (Trường Thịnh): the DECIMAL separator is always "." — "," is only
// ever a thousands separator. Numbers must stay calculation-friendly (Excel/MISA).
// Locking it here so a future locale switch (e.g. vi-VN, which flips the two)
// fails loudly instead of silently corrupting arithmetic.
describe('number separator convention (decimal is always ".")', () => {
  it('display formatting keeps "." as the decimal separator', () => {
    expect(formatLiters(34.5)).toBe('34.50')
    expect(formatLiters(1234567.891)).toBe('1,234,567.89')
  })

  it('parsing treats "," as thousands and "." as decimal', () => {
    expect(parseNumericString('27,760')).toBe(27760)
    expect(parseNumericString('4.3')).toBe(4.3)
    expect(parseNumericString('1,234.50')).toBe(1234.5)
  })
})

describe('formatVND', () => {
  it('groups thousands with commas, no decimals, đ suffix', () => {
    expect(formatVND(1234567)).toBe('1,234,567 đ')
  })
  it('rounds and handles string input', () => {
    expect(formatVND('119368.4')).toBe('119,368 đ')
  })
  it('returns "0 đ" for empty/invalid', () => {
    expect(formatVND(null)).toBe('0 đ')
    expect(formatVND('abc')).toBe('0 đ')
  })
})

describe('groupThousands', () => {
  it('groups a typed amount with commas', () => {
    expect(groupThousands('30000')).toBe('30,000')
    expect(groupThousands('36992230')).toBe('36,992,230')
    expect(groupThousands('500')).toBe('500')
  })
  it('regroups an already grouped amount, either separator', () => {
    expect(groupThousands('36,992,230')).toBe('36,992,230')
    expect(groupThousands('20.355.520')).toBe('20,355,520')
    expect(groupThousands('1,00000')).toBe('100,000')
  })
  it('drops non-digits and leading zeros, keeps empty empty', () => {
    expect(groupThousands('')).toBe('')
    expect(groupThousands('abc')).toBe('')
    expect(groupThousands('0')).toBe('0')
    expect(groupThousands('007000')).toBe('7,000')
  })
})

describe('money field helpers', () => {
  it('strips a grouped amount back to digits', () => {
    expect(moneyDigits('29,710 đ')).toBe('29710')
    expect(moneyDigits('')).toBe('')
    expect(moneyDigits('-1,500')).toBe('1500')
    expect(moneyDigits('-1,500', true)).toBe('-1500')
    expect(moneyDigits('-', true)).toBe('-')
  })
  it('groups a plain amount, keeping a minus', () => {
    expect(groupMoney('29710')).toBe('29,710')
    expect(groupMoney('-1234500')).toBe('-1,234,500')
    expect(groupMoney('-')).toBe('-')
    expect(groupMoney('')).toBe('')
  })
  it('finds the caret after n digits, skipping commas', () => {
    expect(caretAfterDigits('1,234,500', 0)).toBe(0)
    expect(caretAfterDigits('1,234,500', 1)).toBe(1)
    expect(caretAfterDigits('1,234,500', 2)).toBe(3)
    expect(caretAfterDigits('1,234,500', 7)).toBe(9)
    expect(caretAfterDigits('-1,234', 2)).toBe(2)
  })
})

describe('formatLiters', () => {
  it('always shows 2 decimals with comma thousands', () => {
    expect(formatLiters(1234.5)).toBe('1,234.50')
    expect(formatLiters(4.3)).toBe('4.30')
  })
})

describe('formatDateTime / formatDate', () => {
  // Every call site passes a Prisma `Date` — a real instant, not wall-clock
  // text. VN is UTC+7 year-round (no DST), so 01:05Z is 08:05 in Vietnam.
  it('renders an instant in Vietnam time as dd/MM/yyyy HH:mm', () => {
    expect(formatDateTime(new Date('2026-06-17T01:05:00Z'))).toBe('17/06/2026 08:05')
  })
  it('formats dd/MM/yyyy', () => {
    expect(formatDate(new Date('2026-06-17T01:05:00Z'))).toBe('17/06/2026')
  })
  // `@db.Date` columns (shiftDate, issuedDate, expiryDate, effectiveDate) come
  // back from Prisma as UTC midnight — see shiftDateFor in lib/photos/ingest.ts,
  // which writes them with Date.UTC(). Rendering those in +07 must not roll the
  // calendar day forward. Locked here so a future change to vnTime that reads
  // input as wall-clock fails loudly instead of shifting every shift by a day.
  it('keeps the calendar day for UTC-midnight date columns', () => {
    expect(formatDate(new Date(Date.UTC(2026, 5, 17)))).toBe('17/06/2026')
  })
  it('returns empty string for falsy input', () => {
    expect(formatDateTime(null)).toBe('')
    expect(formatDate(undefined)).toBe('')
  })
})
