import { describe, expect, it } from 'vitest'

import {
  chargeAmountOf,
  computedAmountOf,
  nextAmountFields,
  refuseAmountOverride,
} from '@/lib/debts/visit-amount'
import { vi } from '@/messages/vi'

/** A lượt xe the rules have nothing to say about — every case below bends one field. */
const base = {
  litersRead: 38.09,
  unitPriceRead: 26200,
  amountOverride: null,
}

/** The same lượt xe as stored, never yet corrected. */
const stored = {
  ...base,
  originalLitersRead: null,
  originalUnitPriceRead: null,
}

describe('computedAmountOf', () => {
  it('is số lít × đơn giá, rounded to the đồng', () => {
    expect(computedAmountOf(base)).toBe(997_958)
  })

  it('has no answer when either number is missing', () => {
    expect(computedAmountOf({ ...base, litersRead: null })).toBeNull()
    expect(computedAmountOf({ ...base, unitPriceRead: null })).toBeNull()
  })
})

describe('chargeAmountOf', () => {
  it('charges the derived amount when nothing was typed', () => {
    expect(chargeAmountOf(base)).toBe(997_958)
  })

  it('charges what the reviewer typed instead of the derived amount', () => {
    expect(chargeAmountOf({ ...base, amountOverride: 998_020 })).toBe(998_020)
  })

  it('charges a typed amount even when the AI read neither number', () => {
    expect(chargeAmountOf({ litersRead: null, unitPriceRead: null, amountOverride: 998_020 })).toBe(
      998_020
    )
  })
})

describe('refuseAmountOverride', () => {
  it('allows a lượt xe with no typed thành tiền at all', () => {
    expect(refuseAmountOverride(base)).toBeNull()
  })

  it('allows a whole số tiền typed against a số lít', () => {
    expect(refuseAmountOverride({ ...base, amountOverride: 998_020 })).toBeNull()
  })

  it('refuses zero, a negative, and a fraction of a đồng', () => {
    for (const amount of [0, -5, 998_020.5, NaN]) {
      expect(refuseAmountOverride({ ...base, amountOverride: amount })).toBe(
        vi.debtReview.amountManualInvalid
      )
    }
  })

  it('refuses a số tiền no single lượt xe could reach', () => {
    expect(refuseAmountOverride({ ...base, amountOverride: 2_000_000_000 })).toBe(
      vi.debtReview.amountManualTooLarge
    )
  })

  it('refuses a thành tiền typed without a số lít, which MISA would export as nothing', () => {
    expect(refuseAmountOverride({ ...base, litersRead: null, amountOverride: 998_020 })).toBe(
      vi.debtReview.amountManualNeedsLiters
    )
  })
})

describe('nextAmountFields', () => {
  it('leaves everything standing when the patch mentions nothing', () => {
    expect(nextAmountFields(stored, {})).toEqual({
      litersRead: 38.09,
      unitPriceRead: 26200,
      amountOverride: null,
      computedAmount: 997_958,
    })
  })

  it('keeps a standing override when the patch only moves the trạm', () => {
    const next = nextAmountFields({ ...stored, amountOverride: 998_020 }, {})
    expect(next.amountOverride).toBe(998_020)
  })

  it('clears số lít that was blanked, and the derived amount with it', () => {
    const next = nextAmountFields(stored, { litersRead: null })
    expect(next.litersRead).toBeNull()
    expect(next.computedAmount).toBeNull()
  })

  it('takes the typed thành tiền when the patch carries one', () => {
    expect(nextAmountFields(stored, { amountOverride: 998_020 }).amountOverride).toBe(998_020)
  })

  it('drops the override when the patch says so', () => {
    const next = nextAmountFields({ ...stored, amountOverride: 998_020 }, { amountOverride: null })
    expect(next.amountOverride).toBeNull()
  })

  it('drops an override the reviewer did not restate when the reading moves under it', () => {
    const next = nextAmountFields({ ...stored, amountOverride: 998_020 }, { litersRead: 40 })
    expect(next.amountOverride).toBeNull()
  })

  it('keeps an override restated alongside the reading it was typed against', () => {
    const next = nextAmountFields(
      { ...stored, amountOverride: 998_020 },
      { litersRead: 40, amountOverride: 998_020 }
    )
    expect(next.amountOverride).toBe(998_020)
    expect(next.computedAmount).toBe(1_048_000)
  })

  it('keeps what the AI read the first time a reviewer moves it', () => {
    const next = nextAmountFields(stored, { litersRead: 38.1 })
    expect(next.originalLitersRead).toBe(38.09)
  })

  it('says nothing about the original when the value is re-sent unchanged', () => {
    const next = nextAmountFields(stored, { litersRead: 38.09, unitPriceRead: 26200 })
    expect(next.originalLitersRead).toBeUndefined()
    expect(next.originalUnitPriceRead).toBeUndefined()
  })

  it('never re-stamps an original a later correction would overwrite', () => {
    const next = nextAmountFields(
      { ...stored, litersRead: 38.1, originalLitersRead: 38.09 },
      { litersRead: 38.2 }
    )
    expect(next.originalLitersRead).toBeUndefined()
  })
})
