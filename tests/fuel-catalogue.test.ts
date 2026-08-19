import { describe, expect, it } from 'vitest'

import {
  type CatalogueFuel,
  type FuelUsageCounts,
  decideFuelRemoval,
  fuelTypeLabelFrom,
  generateFuelType,
} from '@/lib/fuels/catalogue'
import { fuelTypeLabel } from '@/lib/ui/status'

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

/**
 * The danh mục-backed form of the label helper. Every table stores a khóa; what a
 * người dùng reads is the tên of the matching danh mục row. Nothing here knows about
 * React or Prisma — the caller brings the danh mục, from the server loader or from
 * the client provider.
 */
describe('fuelTypeLabelFrom', () => {
  const CATALOGUE: CatalogueFuel[] = [
    { fuelType: 'XANG_A95', name: 'Xăng A95', areaIndependent: false, isActive: true },
    { fuelType: 'URE', name: 'URE (Adblue)', areaIndependent: true, isActive: true },
  ]

  it('reads the tên of a nhiên liệu in the danh mục', () => {
    expect(fuelTypeLabelFrom(CATALOGUE, 'XANG_A95')).toBe('Xăng A95')
    expect(fuelTypeLabelFrom(CATALOGUE, 'URE')).toBe('URE (Adblue)')
  })

  // What keeps history readable: a khóa the danh mục no longer answers for still
  // renders, as the message-bundle helper has always done.
  it('falls back to the raw khóa when no row matches', () => {
    expect(fuelTypeLabelFrom(CATALOGUE, 'DAU_NHON')).toBe('DAU_NHON')
    expect(fuelTypeLabelFrom([], 'DO')).toBe('DO')
  })

  // The loader hands over ngừng sử dụng rows too, so a nhiên liệu that stopped being
  // sold keeps its tên on the ca, phiếu nhập and công nợ rows that already carry it.
  it('reads the tên of a nhiên liệu đã ngừng like any other', () => {
    const stopped: CatalogueFuel[] = [
      { fuelType: 'DC', name: 'Dầu DC', areaIndependent: false, isActive: false },
    ]
    expect(fuelTypeLabelFrom(stopped, 'DC')).toBe('Dầu DC')
  })
})

/**
 * The old path and the new one must say the same thing while both exist. The danh mục
 * was seeded from this very map (prisma/seed.ts, ticket 01), so the five founding nhiên
 * liệu are the proof: a screen moved onto the danh mục in ticket 05 renders character
 * for character what it renders today.
 */
describe('the danh mục and the message bundle agree', () => {
  const SEEDED: CatalogueFuel[] = [
    { fuelType: 'XANG_A95', name: 'Xăng A95', areaIndependent: false, isActive: true },
    { fuelType: 'E0', name: 'Xăng E0', areaIndependent: false, isActive: true },
    { fuelType: 'DO', name: 'Dầu DO', areaIndependent: false, isActive: true },
    { fuelType: 'DC', name: 'Dầu DC', areaIndependent: false, isActive: true },
    { fuelType: 'URE', name: 'URE (Adblue)', areaIndependent: true, isActive: true },
  ]

  it('renders the identical tên for all five nhiên liệu', () => {
    for (const fuel of SEEDED) {
      expect(fuelTypeLabelFrom(SEEDED, fuel.fuelType)).toBe(fuelTypeLabel(fuel.fuelType))
    }
  })
})
