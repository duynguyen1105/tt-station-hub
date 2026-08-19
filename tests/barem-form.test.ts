import { describe, expect, it } from 'vitest'

import {
  type CatalogueFuel,
  type StationFuelMapping,
  fuelWordResolver,
} from '@/lib/fuels/catalogue'
import { type BaremLookup, type BaremRefusal } from '@/lib/inventory/barem'
import {
  deliveryNoteLiters,
  resolveTankBarem,
  savedCell,
  shownCell,
} from '@/lib/inventory/barem-form'

function found(liters: number): BaremLookup {
  return { ok: true, liters }
}

function refused(reason: BaremRefusal): BaremLookup {
  return { ok: false, reason }
}

function row(input: Partial<Parameters<typeof resolveTankBarem>[0]> = {}) {
  return resolveTankBarem({
    before: null,
    after: null,
    paperBaremBefore: null,
    paperBaremAfter: null,
    ...input,
  })
}

describe('resolveTankBarem', () => {
  it('fills both SL barem cells and the intake when the level rose', () => {
    // DAKNONG1 Hầm 3 as imported: 1200 mm → 12,358 L, 1600 mm → 17,563 L.
    const resolved = row({ before: found(12358), after: found(17563) })
    expect(resolved.baremBefore).toBe(12358)
    expect(resolved.baremAfter).toBe(17563)
    expect(resolved.intakeLiters).toBe(5205)
    expect(resolved.reasons).toEqual([])
    expect(resolved.fellLiters).toBeNull()
  })

  it('says nothing about the paper when its reading agrees with the Barem', () => {
    const resolved = row({
      before: found(12358),
      after: found(17563),
      paperBaremBefore: 12358,
      paperBaremAfter: 17563,
    })
    expect(resolved.paperBefore).toBeNull()
    expect(resolved.paperAfter).toBeNull()
  })

  it('shows the paper reading once it disagrees by a whole litre', () => {
    const resolved = row({
      before: found(12358),
      after: found(17563),
      // A worker copying "12.358" as "12.385" is exactly what this catches.
      paperBaremBefore: 12385,
      paperBaremAfter: 17563.5,
    })
    expect(resolved.paperBefore).toBe(12385)
    // Half a litre is the paper rounding, not a mis-copy.
    expect(resolved.paperAfter).toBeNull()
  })

  it('keeps quiet about the paper where the Barem itself could not answer', () => {
    const resolved = row({ before: refused('above-maximum'), paperBaremBefore: 12385 })
    expect(resolved.paperBefore).toBeNull()
  })

  it('fills nothing while a height is still unmeasured', () => {
    const resolved = row({ after: found(17563) })
    expect(resolved.baremBefore).toBeNull()
    expect(resolved.baremAfter).toBe(17563)
    expect(resolved.intakeLiters).toBeNull()
    expect(resolved.reasons).toEqual([])
    expect(resolved.fellLiters).toBeNull()
  })

  it('leaves a tank that took nothing empty and unremarked', () => {
    const resolved = row({ before: found(12358), after: found(12358) })
    expect(resolved.intakeLiters).toBeNull()
    expect(resolved.fellLiters).toBeNull()
    expect(resolved.reasons).toEqual([])
  })

  it('reports the drop and fills nothing when the level fell', () => {
    const resolved = row({ before: found(17563), after: found(12358) })
    expect(resolved.intakeLiters).toBeNull()
    expect(resolved.fellLiters).toBe(-5205)
  })

  it('names a refusal once when both heights fail the same way', () => {
    const resolved = row({ before: refused('unknown-tank'), after: refused('unknown-tank') })
    expect(resolved.reasons).toEqual(['unknown-tank'])
    expect(resolved.intakeLiters).toBeNull()
  })

  it('keeps the side that resolved when only the other refuses', () => {
    const resolved = row({ before: found(12358), after: refused('above-maximum') })
    expect(resolved.baremBefore).toBe(12358)
    expect(resolved.baremAfter).toBeNull()
    expect(resolved.reasons).toEqual(['above-maximum'])
    expect(resolved.intakeLiters).toBeNull()
  })
})

describe('deliveryNoteLiters', () => {
  // The danh mục and Đăk Nông 1's mã hàng, as seeded (prisma/seed.ts). A goods column
  // is read by the rule that reads a trụ plate and a barem sheet — one rule, not a
  // third — so "XA E0" resolves through the mã hàng and "Dầu DO" through the tên.
  const CATALOGUE: CatalogueFuel[] = [
    { fuelType: 'XANG_A95', name: 'Xăng A95', areaIndependent: false, isActive: true },
    { fuelType: 'E0', name: 'Xăng E0', areaIndependent: false, isActive: true },
    { fuelType: 'DO', name: 'Dầu DO', areaIndependent: false, isActive: true },
    { fuelType: 'DC', name: 'Dầu DC', areaIndependent: false, isActive: true },
    { fuelType: 'URE', name: 'URE (Adblue)', areaIndependent: true, isActive: true },
  ]
  const DAKNONG1: StationFuelMapping[] = [
    { fuelType: 'DO', productCode: 'DO' },
    { fuelType: 'E0', productCode: 'XA E0' },
    { fuelType: 'DC', productCode: 'DO01' },
    { fuelType: 'XANG_A95', productCode: 'A95' },
    { fuelType: 'URE', productCode: 'URE' },
  ]
  const resolveFuel = fuelWordResolver(CATALOGUE, DAKNONG1)

  // The four columns the biên bản chuẩn pre-prints (`lib/imports/goods-columns.ts`).
  const products = [
    { productLabel: 'E0', quantityLiters: 6000 },
    { productLabel: 'DO', quantityLiters: 4000 },
  ]

  it('takes the column that names the tank’s fuel', () => {
    expect(deliveryNoteLiters(products, 'E0', resolveFuel)).toBe(6000)
    expect(deliveryNoteLiters(products, 'DO', resolveFuel)).toBe(4000)
  })

  it('reads a column printed with the tên or the trạm mã hàng', () => {
    expect(
      deliveryNoteLiters([{ productLabel: 'Dầu DO', quantityLiters: 4000 }], 'DO', resolveFuel)
    ).toBe(4000)
    expect(
      deliveryNoteLiters([{ productLabel: 'XA E0', quantityLiters: 6000 }], 'E0', resolveFuel)
    ).toBe(6000)
    // DC is filed under mã hàng "DO01" at Đăk Nông 1 — the case the two-step exists for.
    expect(
      deliveryNoteLiters([{ productLabel: 'DO01', quantityLiters: 2000 }], 'DC', resolveFuel)
    ).toBe(2000)
  })

  it('leaves two columns of the same fuel to the reviewer', () => {
    expect(
      deliveryNoteLiters(
        [
          { productLabel: 'DO', quantityLiters: 4000 },
          { productLabel: 'Dầu DO', quantityLiters: 2000 },
        ],
        'DO',
        resolveFuel
      )
    ).toBeNull()
  })

  it('has nothing to compare when no column names that fuel', () => {
    expect(deliveryNoteLiters(products, 'URE', resolveFuel)).toBeNull()
    expect(deliveryNoteLiters(products, null, resolveFuel)).toBeNull()
    // EA is the E5 column of the biên bản chuẩn and no nhiên liệu answers for it, so
    // the E0 row is offered no comparison rather than E5's litres.
    expect(
      deliveryNoteLiters([{ productLabel: 'EA', quantityLiters: 6000 }], 'E0', resolveFuel)
    ).toBeNull()
    expect(
      deliveryNoteLiters([{ productLabel: 'Hàng hóa', quantityLiters: 6000 }], 'DO', resolveFuel)
    ).toBeNull()
  })

  it('reads a nhiên liệu added after the code was written', () => {
    const withRon98 = [
      ...CATALOGUE,
      { fuelType: 'XANG_RON_98', name: 'Xăng RON 98', areaIndependent: false, isActive: true },
    ]
    expect(
      deliveryNoteLiters(
        [{ productLabel: 'Xăng RON 98', quantityLiters: 6000 }],
        'XANG_RON_98',
        fuelWordResolver(withRon98, DAKNONG1)
      )
    ).toBe(6000)
  })

  it('ignores a column with no quantity on it', () => {
    expect(
      deliveryNoteLiters([{ productLabel: 'DO', quantityLiters: null }], 'DO', resolveFuel)
    ).toBeNull()
  })
})

describe('shownCell', () => {
  it('offers the Barem’s figure while the reviewer has typed none', () => {
    expect(shownCell('', 12358)).toBe('12358')
    expect(shownCell('', null)).toBe('')
  })

  it('keeps what the reviewer typed — the paper is the legal record', () => {
    expect(shownCell('12400', 12358)).toBe('12400')
    expect(shownCell('0', 5205)).toBe('0')
  })
})

describe('savedCell', () => {
  it('saves the Barem’s own figure, whole or fractional', () => {
    expect(savedCell('', 12358)).toBe(12358)
    // The sheet is read verbatim, so a litre value can carry decimals. Written
    // out and read back, "12358.125" would be three thousand groups.
    expect(savedCell('', 12358.125)).toBe(12358.125)
    expect(savedCell('', null)).toBeNull()
  })

  it('saves what the reviewer typed, read as a Vietnamese number', () => {
    expect(savedCell('12.400', 12358)).toBe(12400)
    expect(savedCell('12358,5', 12358)).toBe(12358.5)
    expect(savedCell('0', 5205)).toBe(0)
  })
})
