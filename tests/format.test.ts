import { describe, expect, it } from 'vitest'

import { parseNumericString } from '@/lib/ai/extract-visit'
import { formatDate, formatDateTime, formatLiters, formatVND } from '@/lib/format'

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

describe('formatLiters', () => {
  it('always shows 2 decimals with comma thousands', () => {
    expect(formatLiters(1234.5)).toBe('1,234.50')
    expect(formatLiters(4.3)).toBe('4.30')
  })
})

describe('formatDateTime / formatDate', () => {
  it('formats dd/MM/yyyy HH:mm', () => {
    expect(formatDateTime('2026-06-17T08:05:00')).toBe('17/06/2026 08:05')
  })
  it('formats dd/MM/yyyy', () => {
    expect(formatDate('2026-06-17T08:05:00')).toBe('17/06/2026')
  })
  it('returns empty string for falsy input', () => {
    expect(formatDateTime(null)).toBe('')
    expect(formatDate(undefined)).toBe('')
  })
})
