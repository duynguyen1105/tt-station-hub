import { describe, expect, it } from 'vitest'

import { generateFuelType } from '@/lib/fuels/catalogue'

describe('generateFuelType', () => {
  it('uppercases and joins the words of a tên with a single underscore', () => {
    expect(generateFuelType('Xăng RON 98')).toBe('XANG_RON_98')
  })

  it('strips Vietnamese diacritics', () => {
    expect(generateFuelType('Dầu nhờn')).toBe('DAU_NHON')
    expect(generateFuelType('Xăng sinh học')).toBe('XANG_SINH_HOC')
  })

  it('folds đ and Đ to d', () => {
    expect(generateFuelType('Đầu đốt')).toBe('DAU_DOT')
  })

  it('collapses punctuation to an underscore and drops it at the edges', () => {
    expect(generateFuelType('Xăng RON 95 (nhập khẩu)')).toBe('XANG_RON_95_NHAP_KHAU')
    expect(generateFuelType('Dầu DO 0,001S-V')).toBe('DAU_DO_0_001S_V')
    expect(generateFuelType('Xăng A95!')).toBe('XANG_A95')
  })

  it('collapses runs of whitespace and trims the ends', () => {
    expect(generateFuelType('  Xăng   RON  98  ')).toBe('XANG_RON_98')
  })

  it('yields an empty khóa for a tên with nothing to key on', () => {
    expect(generateFuelType('   ')).toBe('')
    expect(generateFuelType('---')).toBe('')
  })
})

// The danh mục's five founding nhiên liệu predate this rule: their khóa are the
// strings every giá bán lẻ, tồn kho, đo hầm, trụ, phiếu nhập and công nợ row on
// disk is already keyed by, so they are seeded literally (prisma/seed.ts) rather
// than generated. Only one of the five happens to round-trip; the other four are
// frozen exceptions, and this test exists so that stays a deliberate fact.
describe('the five founding nhiên liệu', () => {
  it('regenerates the khóa of Xăng A95', () => {
    expect(generateFuelType('Xăng A95')).toBe('XANG_A95')
  })

  // What the rule would produce from the other four tên — deliberately not their
  // khóa. Pinned so that anyone tempted to bend the rule until it reproduces them
  // sees these four expectations change and knows the seed is what to check.
  it('would generate a different khóa for the other four', () => {
    expect(generateFuelType('Dầu DO')).toBe('DAU_DO')
    expect(generateFuelType('Xăng E0')).toBe('XANG_E0')
    expect(generateFuelType('Dầu DC')).toBe('DAU_DC')
    expect(generateFuelType('URE (Adblue)')).toBe('URE_ADBLUE')
  })
})
