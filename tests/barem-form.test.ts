import { describe, expect, it } from 'vitest'

import { type BaremLookup, type BaremRefusal } from '@/lib/inventory/barem'
import {
  deliveryNoteLiters,
  fuelTypeFromProductLabel,
  resolveTankBarem,
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

describe('fuelTypeFromProductLabel', () => {
  it('reads the product columns the biên bản actually carries', () => {
    expect(fuelTypeFromProductLabel('RON 95')).toBe('XANG_A95')
    expect(fuelTypeFromProductLabel('E5 RON 92')).toBe('E0')
    expect(fuelTypeFromProductLabel('DO 0,05S-V')).toBe('DO')
    expect(fuelTypeFromProductLabel('Dầu DC')).toBe('DC')
    expect(fuelTypeFromProductLabel('URE')).toBe('URE')
    expect(fuelTypeFromProductLabel('Xăng')).toBe('XANG_A95')
  })

  it('answers nothing for a column that names no fuel it knows', () => {
    expect(fuelTypeFromProductLabel('')).toBeNull()
    expect(fuelTypeFromProductLabel('Hàng hóa')).toBeNull()
  })
})

describe('deliveryNoteLiters', () => {
  const products = [
    { productLabel: 'RON 95', quantityLiters: 6000 },
    { productLabel: 'DO 0,05S-V', quantityLiters: 4000 },
  ]

  it('takes the column that names the tank’s fuel', () => {
    expect(deliveryNoteLiters(products, 'XANG_A95')).toBe(6000)
    expect(deliveryNoteLiters(products, 'DO')).toBe(4000)
  })

  it('leaves two columns of the same fuel to the reviewer', () => {
    expect(
      deliveryNoteLiters(
        [
          { productLabel: 'DO 0,05S', quantityLiters: 4000 },
          { productLabel: 'DO 0,001S', quantityLiters: 2000 },
        ],
        'DO'
      )
    ).toBeNull()
  })

  it('has nothing to compare when no column names that fuel', () => {
    expect(deliveryNoteLiters(products, 'URE')).toBeNull()
    expect(deliveryNoteLiters(products, null)).toBeNull()
    expect(
      deliveryNoteLiters([{ productLabel: 'Hàng hóa', quantityLiters: 6000 }], 'DO')
    ).toBeNull()
  })

  it('ignores a column with no quantity on it', () => {
    expect(
      deliveryNoteLiters([{ productLabel: 'RON 95', quantityLiters: null }], 'XANG_A95')
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
