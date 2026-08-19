import { describe, expect, it } from 'vitest'

import { type FuelUsageCounts, decideFuelRemoval, generateFuelType } from '@/lib/fuels/catalogue'

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

/**
 * Xoá asks one question first: is anything holding this nhiên liệu? Nothing is, and
 * the row goes; anything is, and it cannot go — because the tên of a nhiên liệu on a
 * past ca, phiếu nhập or công nợ is read back through the danh mục row. The counts
 * come from the route; what they mean is decided here.
 */
describe('decideFuelRemoval', () => {
  const NOTHING: FuelUsageCounts = {
    fuelMaps: 0,
    dispensers: 0,
    prices: 0,
    inventory: 0,
    movements: 0,
    openingBalances: 0,
    imports: 0,
    tankDips: 0,
    debtVisits: 0,
  }

  it('deletes a nhiên liệu nothing uses', () => {
    expect(decideFuelRemoval(NOTHING)).toEqual({ kind: 'delete' })
  })

  // One kind at a time: each of the eight has to block on its own, or a nhiên liệu
  // held only by that kind would be deleted out from under it.
  it.each([
    ['fuelMaps', 3, '3 trạm đã map nhiên liệu'],
    ['dispensers', 12, '12 trụ bơm'],
    ['prices', 48, '48 kỳ giá'],
    ['inventory', 2, '2 dòng tồn kho'],
    ['movements', 31, '31 dòng biến động tồn kho'],
    ['openingBalances', 1, '1 số đầu kỳ'],
    ['imports', 7, '7 phiếu nhập'],
    ['tankDips', 5, '5 lần đo hầm'],
    ['debtVisits', 9, '9 lượt bán nợ'],
  ] as const)('refuses to delete a nhiên liệu held by %s alone', (kind, count, reason) => {
    expect(decideFuelRemoval({ ...NOTHING, [kind]: count })).toEqual({
      kind: 'deactivate',
      reasons: [reason],
    })
  })

  it('names every kind of usage found, so kế toán reads the whole reason', () => {
    expect(
      decideFuelRemoval({ ...NOTHING, fuelMaps: 3, dispensers: 12, prices: 48, debtVisits: 9 })
    ).toEqual({
      kind: 'deactivate',
      reasons: ['3 trạm đã map nhiên liệu', '12 trụ bơm', '48 kỳ giá', '9 lượt bán nợ'],
    })
  })
})
