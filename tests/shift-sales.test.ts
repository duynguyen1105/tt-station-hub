import { describe, expect, it } from 'vitest'

import {
  type SaleDispenser,
  type SaleReading,
  computeShiftSales,
} from '@/lib/inventory/shift-sales'

const dispensers: SaleDispenser[] = [
  { id: 'd1', fuelType: 'DO' },
  { id: 'd2', fuelType: 'DO' },
  { id: 'd3', fuelType: 'E0' },
]

describe('computeShiftSales', () => {
  it('sums liters per fuel type from positive deltas', () => {
    const readings: SaleReading[] = [
      { dispenserId: 'd1', openingElectronicReading: 1000, electronicReading: 1200 }, // +200 DO
      { dispenserId: 'd2', openingElectronicReading: 500, electronicReading: 650 }, // +150 DO
      { dispenserId: 'd3', openingElectronicReading: null, electronicReading: 300 }, // no opening -> no sale
    ]
    const { sales } = computeShiftSales(readings, dispensers)
    expect(sales).toEqual([{ fuelType: 'DO', liters: 350 }])
  })

  it('advances only dispensers with a positive delta', () => {
    const readings: SaleReading[] = [
      { dispenserId: 'd1', openingElectronicReading: 1000, electronicReading: 1200 }, // +200 -> advance
      { dispenserId: 'd3', openingElectronicReading: null, electronicReading: 300 }, // no opening -> no advance
    ]
    const { advances } = computeShiftSales(readings, dispensers)
    expect(advances).toEqual([{ dispenserId: 'd1', newReading: 1200 }])
  })

  it('books zero liters and does not advance when the opening is null', () => {
    const readings: SaleReading[] = [
      { dispenserId: 'd1', openingElectronicReading: null, electronicReading: 1200 },
    ]
    const { sales, advances } = computeShiftSales(readings, dispensers)
    expect(sales).toEqual([])
    expect(advances).toEqual([])
  })

  it('leaves the cache untouched on a decreased reading', () => {
    const readings: SaleReading[] = [
      { dispenserId: 'd2', openingElectronicReading: 500, electronicReading: 400 }, // decrease -> no sale, no advance
    ]
    const { sales, advances } = computeShiftSales(readings, dispensers)
    expect(sales).toEqual([])
    expect(advances).toEqual([])
  })
})
