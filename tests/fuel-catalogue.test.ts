import { describe, expect, it } from 'vitest'

import {
  type CatalogueFuel,
  type FuelUsageCounts,
  type StationFuelMapping,
  type StationFuelUsage,
  addableFuels,
  decideFuelRemoval,
  decideStationFuelRemoval,
  fuelTypeLabelFrom,
  generateFuelType,
  resolvePlateFuel,
  selectableFuels,
  stationFuels,
} from '@/lib/fuels/catalogue'

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
  // renders as itself rather than blank.
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
 * What an ô chọn is allowed to offer. Every fuel picker in the app — the kho movement
 * form, the phiếu nhập form, the công nợ picker — asks this rather than filtering for
 * itself, so Ngừng sử dụng takes a nhiên liệu off all of them at once.
 */
describe('selectableFuels', () => {
  const CATALOGUE: CatalogueFuel[] = [
    { fuelType: 'XANG_A95', name: 'Xăng A95', areaIndependent: false, isActive: true },
    { fuelType: 'DC', name: 'Dầu DC', areaIndependent: false, isActive: false },
    { fuelType: 'DO', name: 'Dầu DO', areaIndependent: false, isActive: true },
  ]

  it('offers every nhiên liệu Trường Thịnh still sells, in danh mục order', () => {
    expect(selectableFuels(CATALOGUE).map((fuel) => fuel.fuelType)).toEqual(['XANG_A95', 'DO'])
  })

  // The two halves of the same rule: unselectable for a new row, still readable on an
  // old one, so a ca or phiếu nhập written before Trường Thịnh stopped selling it keeps
  // showing its tên.
  it('drops a nhiên liệu đã ngừng from the choice while its tên still resolves', () => {
    expect(selectableFuels(CATALOGUE).some((fuel) => fuel.fuelType === 'DC')).toBe(false)
    expect(fuelTypeLabelFrom(CATALOGUE, 'DC')).toBe('Dầu DC')
  })

  it('offers nothing when nothing is in use', () => {
    expect(selectableFuels([])).toEqual([])
  })
})

/**
 * What Thêm nhiên liệu offers a trạm. A trạm handles a nhiên liệu iff its Map nhiên
 * liệu has a row for it, so the picker is the danh mục minus the rows the trạm already
 * has — a duplicate row cannot be created, and one đã ngừng cannot be taken on.
 */
describe('addableFuels', () => {
  const CATALOGUE: CatalogueFuel[] = [
    { fuelType: 'XANG_A95', name: 'Xăng A95', areaIndependent: false, isActive: true },
    { fuelType: 'DC', name: 'Dầu DC', areaIndependent: false, isActive: false },
    { fuelType: 'DO', name: 'Dầu DO', areaIndependent: false, isActive: true },
    { fuelType: 'E0', name: 'Xăng E0', areaIndependent: false, isActive: true },
  ]

  it('offers every nhiên liệu the trạm has no row for, in danh mục order', () => {
    expect(addableFuels(CATALOGUE, ['DO']).map((fuel) => fuel.fuelType)).toEqual(['XANG_A95', 'E0'])
  })

  it('offers the whole danh mục to a trạm that has declared nothing yet', () => {
    expect(addableFuels(CATALOGUE, []).map((fuel) => fuel.fuelType)).toEqual([
      'XANG_A95',
      'DO',
      'E0',
    ])
  })

  it('never offers a nhiên liệu đã ngừng, whether the trạm has it or not', () => {
    expect(addableFuels(CATALOGUE, []).some((fuel) => fuel.fuelType === 'DC')).toBe(false)
    expect(addableFuels(CATALOGUE, ['DC']).some((fuel) => fuel.fuelType === 'DC')).toBe(false)
  })

  it('offers nothing to a trạm that already sells everything', () => {
    expect(addableFuels(CATALOGUE, ['XANG_A95', 'DO', 'E0'])).toEqual([])
  })

  // Đăk Nông 1 gives Dầu DO one mã hàng and Đăk Nông 2 another: what one trạm has
  // mapped says nothing about what the next one may take on.
  it('reads only the rows of the trạm it is asked about', () => {
    expect(addableFuels(CATALOGUE, ['DO']).map((fuel) => fuel.fuelType)).toContain('E0')
    expect(addableFuels(CATALOGUE, ['E0']).map((fuel) => fuel.fuelType)).toContain('DO')
  })
})

/**
 * A trạm stops selling a nhiên liệu. Removing its Map nhiên liệu row is what says so,
 * and it is refused while the trạm is still equipped to pump it or still holding it:
 * an active trụ pumping it, or a tồn kho that is not zero. What the trạm sold in the
 * past is never in the way — those rows store the khóa and read their tên back through
 * the danh mục, which the removal does not touch.
 */
describe('decideStationFuelRemoval', () => {
  const EMPTY: StationFuelUsage = { dispensers: [], stock: 0 }

  it('removes a nhiên liệu the trạm neither pumps nor holds', () => {
    expect(decideStationFuelRemoval(EMPTY)).toEqual({ kind: 'remove' })
  })

  it('refuses while an active trụ pumps it, naming the trụ', () => {
    expect(
      decideStationFuelRemoval({
        ...EMPTY,
        dispensers: [
          { displayName: 'Trụ 1', isActive: true },
          { displayName: 'Trụ 4', isActive: true },
        ],
      })
    ).toEqual({
      kind: 'blocked',
      reasons: ['Trụ đang bơm nhiên liệu này: Trụ 1, Trụ 4'],
    })
  })

  it('refuses while the tồn kho is not zero, naming the số lít', () => {
    expect(decideStationFuelRemoval({ ...EMPTY, stock: 3240 })).toEqual({
      kind: 'blocked',
      reasons: ['Tồn kho còn 3,240.00 lít'],
    })
  })

  // A tồn kho that has drifted below zero is still stock kế toán has to settle, so it
  // blocks exactly as a positive one does.
  it('refuses on a tồn kho âm as well', () => {
    expect(decideStationFuelRemoval({ ...EMPTY, stock: -12.5 })).toEqual({
      kind: 'blocked',
      reasons: ['Tồn kho còn -12.50 lít'],
    })
  })

  it('lists both blockers when both are present', () => {
    expect(
      decideStationFuelRemoval({
        dispensers: [{ displayName: 'Trụ 2', isActive: true }],
        stock: 3240,
      })
    ).toEqual({
      kind: 'blocked',
      reasons: ['Trụ đang bơm nhiên liệu này: Trụ 2', 'Tồn kho còn 3,240.00 lít'],
    })
  })

  // A trụ ngừng hoạt động pumps nothing, which is exactly how kế toán clears this
  // blocker: ngừng the trụ, then remove the nhiên liệu.
  it('lets an inactive trụ through', () => {
    expect(
      decideStationFuelRemoval({
        ...EMPTY,
        dispensers: [{ displayName: 'Trụ 3', isActive: false }],
      })
    ).toEqual({ kind: 'remove' })
  })
})

/**
 * What a fuel picker inside a trạm may offer. The mirror of `addableFuels`: that one
 * answers what the trạm has yet to take on, this one what it has already taken on and
 * may therefore book a movement, a phiếu nhập or a công nợ against.
 */
describe('stationFuels', () => {
  const CATALOGUE: CatalogueFuel[] = [
    { fuelType: 'XANG_A95', name: 'Xăng RON 95', areaIndependent: false, isActive: true },
    { fuelType: 'DC', name: 'Dầu hỏa', areaIndependent: false, isActive: false },
    { fuelType: 'DO', name: 'Dầu DO', areaIndependent: false, isActive: true },
    { fuelType: 'E0', name: 'Xăng E0', areaIndependent: false, isActive: true },
  ]

  it('offers only what the trạm has a Map nhiên liệu row for, in danh mục order', () => {
    expect(stationFuels(CATALOGUE, ['E0', 'DO']).map((fuel) => fuel.fuelType)).toEqual(['DO', 'E0'])
  })

  it('offers nothing to a trạm that has declared no nhiên liệu', () => {
    expect(stationFuels(CATALOGUE, [])).toEqual([])
  })

  // The row survives Ngừng sử dụng so the trạm's history still reads, but the ô chọn
  // stops offering it the moment Trường Thịnh stops selling it.
  it('drops a nhiên liệu đã ngừng the trạm still has a row for', () => {
    expect(stationFuels(CATALOGUE, ['DO', 'DC']).map((fuel) => fuel.fuelType)).toEqual(['DO'])
  })

  // Đăk Nông 1 sells DO; Đăk Nông 2 sells A95. Neither is offered the other's nhiên
  // liệu, because the rows read are its own.
  it('reads only the rows of the trạm it is asked about', () => {
    expect(stationFuels(CATALOGUE, ['DO']).map((fuel) => fuel.fuelType)).toEqual(['DO'])
    expect(stationFuels(CATALOGUE, ['XANG_A95']).map((fuel) => fuel.fuelType)).toEqual(['XANG_A95'])
  })

  // A khóa left behind by a nhiên liệu deleted from the danh mục names nothing to
  // offer; it must not become an ô chọn entry with no tên.
  it('ignores a mapped khóa the danh mục no longer holds', () => {
    expect(stationFuels(CATALOGUE, ['DO', 'GONE']).map((fuel) => fuel.fuelType)).toEqual(['DO'])
  })
})

/**
 * What the AI reads off a trụ or hầm plate, turned into a khóa. The prompt no longer
 * carries a list of codes — it copies the fuel word as printed — so this is the one
 * place that decides what that word means, and it decides it per trạm.
 *
 * The fixture is Đăk Nông 1's real Map nhiên liệu (prisma/seed.ts): it files Dầu DC
 * under mã hàng "DO01", which is exactly the case the two-step fallback exists for.
 */
describe('resolvePlateFuel', () => {
  const CATALOGUE: CatalogueFuel[] = [
    { fuelType: 'XANG_A95', name: 'Xăng A95', areaIndependent: false, isActive: true },
    { fuelType: 'E0', name: 'Xăng E0', areaIndependent: false, isActive: true },
    { fuelType: 'DO', name: 'Dầu DO', areaIndependent: false, isActive: true },
    { fuelType: 'DC', name: 'Dầu DC', areaIndependent: false, isActive: true },
    { fuelType: 'URE', name: 'URE (Adblue)', areaIndependent: true, isActive: true },
  ]
  // Đăk Nông 1's mã hàng, as seeded.
  const DAKNONG1: StationFuelMapping[] = [
    { fuelType: 'DO', productCode: 'DO' },
    { fuelType: 'E0', productCode: 'XA E0' },
    { fuelType: 'DC', productCode: 'DO01' },
    { fuelType: 'XANG_A95', productCode: 'A95' },
    { fuelType: 'URE', productCode: 'URE' },
  ]

  it('resolves a repainted plate through the trạm mã hàng', () => {
    expect(resolvePlateFuel(CATALOGUE, DAKNONG1, 'DO01')).toBe('DC')
    expect(resolvePlateFuel(CATALOGUE, DAKNONG1, 'A95')).toBe('XANG_A95')
  })

  // The whole point of the fallback: the plate rollout is gradual, so a trụ still
  // painted "DC" reads at the same trạm and on the same day as one painted "DO01".
  it('resolves a plate that has not been repainted through the khóa', () => {
    expect(resolvePlateFuel(CATALOGUE, DAKNONG1, 'DC')).toBe('DC')
    expect(resolvePlateFuel(CATALOGUE, DAKNONG1, 'E0')).toBe('E0')
  })

  it('resolves a plate printed with the tên', () => {
    expect(resolvePlateFuel(CATALOGUE, DAKNONG1, 'Dầu DO')).toBe('DO')
    expect(resolvePlateFuel(CATALOGUE, DAKNONG1, 'URE (Adblue)')).toBe('URE')
  })

  it('ignores case, diacritics and surrounding whitespace', () => {
    expect(resolvePlateFuel(CATALOGUE, DAKNONG1, '  do01  ')).toBe('DC')
    expect(resolvePlateFuel(CATALOGUE, DAKNONG1, 'xăng a95')).toBe('XANG_A95')
    expect(resolvePlateFuel(CATALOGUE, DAKNONG1, 'XANG E0')).toBe('E0')
    expect(resolvePlateFuel(CATALOGUE, DAKNONG1, ' xa e0 ')).toBe('E0')
  })

  // Phúc Tiến files Xăng A95 under "XA95"; Đăk Nông 1 files it under "A95". A plate
  // carrying the other trạm's mã hàng means nothing here — the mã hàng belongs to the
  // pair (trạm, nhiên liệu), so only this trạm's rows are read.
  it('does not resolve another trạm mã hàng', () => {
    const phucTien: StationFuelMapping[] = [{ fuelType: 'XANG_A95', productCode: 'XA95' }]
    expect(resolvePlateFuel(CATALOGUE, phucTien, 'A95')).toBeNull()
    expect(resolvePlateFuel(CATALOGUE, DAKNONG1, 'XA95')).toBeNull()
  })

  // ...unless the word happens to be a tên or khóa as well, which is company-global
  // and so reads at every trạm whatever its mã hàng.
  it('still resolves another trạm mã hàng that is also a khóa', () => {
    const phucTien: StationFuelMapping[] = [{ fuelType: 'XANG_A95', productCode: 'XA95' }]
    expect(resolvePlateFuel(CATALOGUE, phucTien, 'DO')).toBe('DO')
  })

  // A nhiên liệu Trường Thịnh has stopped selling never comes back through a photo —
  // not through the trạm's leftover Map nhiên liệu row, and not through the danh mục.
  it('does not resolve a nhiên liệu đã ngừng', () => {
    const stopped = CATALOGUE.map((fuel) =>
      fuel.fuelType === 'DC' ? { ...fuel, isActive: false } : fuel
    )
    expect(resolvePlateFuel(stopped, DAKNONG1, 'DO01')).toBeNull()
    expect(resolvePlateFuel(stopped, DAKNONG1, 'DC')).toBeNull()
    expect(resolvePlateFuel(stopped, DAKNONG1, 'Dầu DC')).toBeNull()
  })

  // Ticket 14's own story: Xăng RON 98 did not exist when the prompt was written, and
  // reads off a plate the day Đăk Nông 1 gives it a mã hàng.
  it('resolves a nhiên liệu added today', () => {
    const withRon98: CatalogueFuel[] = [
      ...CATALOGUE,
      { fuelType: 'XANG_RON_98', name: 'Xăng RON 98', areaIndependent: false, isActive: true },
    ]
    expect(resolvePlateFuel(withRon98, DAKNONG1, 'A98')).toBeNull()
    const mapped: StationFuelMapping[] = [
      ...DAKNONG1,
      { fuelType: 'XANG_RON_98', productCode: 'A98' },
    ]
    expect(resolvePlateFuel(withRon98, mapped, 'A98')).toBe('XANG_RON_98')
    // And through the danh mục even before the mã hàng exists, if the plate says so.
    expect(resolvePlateFuel(withRon98, DAKNONG1, 'Xăng RON 98')).toBe('XANG_RON_98')
  })

  // Never guess: a wrong nhiên liệu that looks confident is worse than an empty field
  // waiting in a review queue.
  it('yields nothing for a word it cannot place', () => {
    expect(resolvePlateFuel(CATALOGUE, DAKNONG1, 'A98')).toBeNull()
    expect(resolvePlateFuel(CATALOGUE, DAKNONG1, 'HẦM 3')).toBeNull()
    expect(resolvePlateFuel(CATALOGUE, DAKNONG1, null)).toBeNull()
    expect(resolvePlateFuel(CATALOGUE, DAKNONG1, undefined)).toBeNull()
    expect(resolvePlateFuel(CATALOGUE, DAKNONG1, '')).toBeNull()
    expect(resolvePlateFuel(CATALOGUE, DAKNONG1, '   ')).toBeNull()
    expect(resolvePlateFuel(CATALOGUE, DAKNONG1, '---')).toBeNull()
  })

  // A trạm with no Map nhiên liệu row yet still reads its plates: the danh mục is
  // company-global and needs no declaration.
  it('reads the danh mục for a trạm that has declared nothing', () => {
    expect(resolvePlateFuel(CATALOGUE, [], 'DO')).toBe('DO')
    expect(resolvePlateFuel(CATALOGUE, [], 'DO01')).toBeNull()
  })

  // A Map nhiên liệu row left pointing at a khóa the danh mục no longer holds resolves
  // to nothing — the same rule as every other picker.
  it('ignores a mã hàng whose khóa the danh mục no longer holds', () => {
    expect(resolvePlateFuel(CATALOGUE, [{ fuelType: 'GONE', productCode: 'G1' }], 'G1')).toBeNull()
  })
})
