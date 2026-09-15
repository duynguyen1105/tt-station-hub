import { describe, expect, it } from 'vitest'

import { placeLitersDecimal } from '@/lib/ai/extract-visit'
import { type ExtractVisitResult } from '@/lib/ai/types'
import { boardPriceOf, priceMeterRead } from '@/lib/debts/board-price'

const day = (iso: string) => new Date(`${iso}T00:00:00+07:00`)

/** Vùng 2's bảng giá as the settings page showed it on 15/09. */
const prices = [
  { fuelType: 'DO', effectiveDate: day('2026-07-20'), unitPrice: 24000 },
  { fuelType: 'DO', effectiveDate: day('2026-08-13'), unitPrice: 29910 },
  { fuelType: 'DO', effectiveDate: day('2026-10-01'), unitPrice: 31000 },
  { fuelType: 'DAU_DO', effectiveDate: day('2026-08-21'), unitPrice: 29110 },
]

/** A pump read as the AI hands it over, before the liters decimal is placed. */
function read(overrides: Partial<ExtractVisitResult>): ExtractVisitResult {
  return placeLitersDecimal({
    meterType: 'debt_meter',
    displayedAmount: null,
    liters: null,
    litersResolved: null,
    litersResolution: null,
    unitPrice: null,
    stationLabel: null,
    dispenserLabel: null,
    fuelType: null,
    computedAmount: null,
    amountMatchesDisplay: null,
    litersConfidence: 72,
    unitPriceConfidence: 55,
    amountConfidence: 72,
    notes: '',
    raw: {},
    ...overrides,
  })
}

describe('boardPriceOf', () => {
  it('is the price in force for that nhiên liệu on the visit date', () => {
    expect(boardPriceOf(prices, 'DO', day('2026-09-15'))).toBe(29910)
    expect(boardPriceOf(prices, 'DO', day('2026-08-01'))).toBe(24000)
    expect(boardPriceOf(prices, 'DAU_DO', day('2026-09-15'))).toBe(29110)
  })

  it('has no price for an unknown nhiên liệu or before the first row', () => {
    expect(boardPriceOf(prices, null, day('2026-09-15'))).toBeNull()
    expect(boardPriceOf(prices, 'A95', day('2026-09-15'))).toBeNull()
    expect(boardPriceOf(prices, 'DO', day('2026-07-01'))).toBeNull()
  })
})

describe('priceMeterRead', () => {
  it('charges the board price, never the ĐƠN GIÁ the AI guessed (50H-210.10, 15/09)', () => {
    const meter = read({ liters: '380860', unitPrice: '26200', displayedAmount: '998020' })
    const priced = priceMeterRead(meter, prices, 'DO', day('2026-09-15'))
    expect(priced.unitPriceRead).toBe(29910)
    expect(priced.meter.computedAmount).toBe(Math.round(380.86 * 29910))
    expect(priced.anomalies).toEqual([])
  })

  it('places the liters decimal against the board price, not the misread one', () => {
    // 340.000 L × 29,110 = 9,897,400, shown with its last digit dropped.
    const meter = read({ liters: '340000', unitPrice: '26200', displayedAmount: '989740' })
    expect(meter.litersResolution).toBe('unverified')
    const priced = priceMeterRead(meter, prices, 'DAU_DO', day('2026-09-15'))
    expect(priced.meter.litersResolved).toBe(340)
    expect(priced.meter.litersResolution).toBe('verified')
    expect(priced.meter.amountMatchesDisplay).toBe(true)
  })

  it('leaves the đơn giá blank and says why when the board has none', () => {
    const meter = read({ liters: '340000', unitPrice: '29110', displayedAmount: '989740' })
    const priced = priceMeterRead(meter, prices, null, day('2026-09-15'))
    expect(priced.unitPriceRead).toBeNull()
    expect(priced.meter.computedAmount).toBeNull()
    expect(priced.anomalies).toEqual(['price_missing'])
  })
})
