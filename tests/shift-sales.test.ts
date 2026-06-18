import { describe, expect, it } from 'vitest'

import {
  type SaleDispenser,
  type SaleReading,
  computeShiftSales,
} from '@/lib/inventory/shift-sales'

const dispensers: SaleDispenser[] = [
  { id: 'd1', fuelType: 'DO', lastElectronicReading: 1000 },
  { id: 'd2', fuelType: 'DO', lastElectronicReading: 500 },
  { id: 'd3', fuelType: 'E0', lastElectronicReading: null },
]

describe('computeShiftSales', () => {
  it('sums liters per fuel type from positive deltas', () => {
    const readings: SaleReading[] = [
      { dispenserId: 'd1', electronicReading: 1200 }, // +200 DO
      { dispenserId: 'd2', electronicReading: 650 }, // +150 DO
      { dispenserId: 'd3', electronicReading: 300 }, // no last reading -> no sale
    ]
    const { sales } = computeShiftSales(readings, dispensers)
    expect(sales).toEqual([{ fuelType: 'DO', liters: 350 }])
  })

  it('advances every dispenser that has a reading', () => {
    const readings: SaleReading[] = [
      { dispenserId: 'd1', electronicReading: 1200 },
      { dispenserId: 'd3', electronicReading: 300 },
    ]
    const { advances } = computeShiftSales(readings, dispensers)
    expect(advances).toEqual([
      { dispenserId: 'd1', newReading: 1200 },
      { dispenserId: 'd3', newReading: 300 },
    ])
  })

  it('ignores null readings and non-positive deltas', () => {
    const readings: SaleReading[] = [
      { dispenserId: 'd1', electronicReading: null },
      { dispenserId: 'd2', electronicReading: 400 }, // decrease -> not a sale
    ]
    const { sales, advances } = computeShiftSales(readings, dispensers)
    expect(sales).toEqual([])
    expect(advances).toEqual([{ dispenserId: 'd2', newReading: 400 }])
  })
})
