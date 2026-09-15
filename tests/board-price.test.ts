import { describe, expect, it } from 'vitest'

import { boardPriceOf, priceMismatchOf } from '@/lib/debts/board-price'

/** Vùng 2's bảng giá as it stood on 15/09: DO moved from 24,000 to 29,910 on 13/08. */
const prices = [
  { fuelType: 'DO', effectiveDate: new Date('2026-07-20T00:00:00+07:00'), unitPrice: 24_000 },
  { fuelType: 'DO', effectiveDate: new Date('2026-08-13T00:00:00+07:00'), unitPrice: 29_910 },
  { fuelType: 'E0', effectiveDate: new Date('2026-08-13T00:00:00+07:00'), unitPrice: 21_650 },
]
const visitDate = new Date('2026-09-15T07:38:00+07:00')

describe('boardPriceOf', () => {
  it('is the latest price in force on the visit date', () => {
    expect(boardPriceOf(prices, 'DO', visitDate)).toBe(29_910)
    expect(boardPriceOf(prices, 'DO', new Date('2026-08-01T00:00:00+07:00'))).toBe(24_000)
  })

  it('has no answer for an unknown nhiên liệu or one the bảng giá does not price yet', () => {
    expect(boardPriceOf(prices, null, visitDate)).toBeNull()
    expect(boardPriceOf(prices, 'DC', visitDate)).toBeNull()
    expect(boardPriceOf(prices, 'DO', new Date('2026-07-01T00:00:00+07:00'))).toBeNull()
  })
})

describe('priceMismatchOf', () => {
  it('flags a glared read that is not the bảng giá price (the 50H-210.10 fill)', () => {
    expect(priceMismatchOf(prices, 'DO', visitDate, 26_200)).toBe(true)
  })

  it('is quiet when the read is the bảng giá price', () => {
    expect(priceMismatchOf(prices, 'DO', visitDate, 29_910)).toBe(false)
  })

  it("flags a read that is another nhiên liệu's price", () => {
    expect(priceMismatchOf(prices, 'DO', visitDate, 21_650)).toBe(true)
  })

  it('without a priced nhiên liệu, only asks that the read be some nhiên liệu’s price', () => {
    expect(priceMismatchOf(prices, null, visitDate, 21_650)).toBe(false)
    expect(priceMismatchOf(prices, null, visitDate, 26_200)).toBe(true)
    expect(priceMismatchOf(prices, 'DC', visitDate, 29_910)).toBe(false)
  })

  it('has nothing to say with no read or an empty bảng giá', () => {
    expect(priceMismatchOf(prices, 'DO', visitDate, null)).toBe(false)
    expect(priceMismatchOf([], 'DO', visitDate, 26_200)).toBe(false)
  })
})
