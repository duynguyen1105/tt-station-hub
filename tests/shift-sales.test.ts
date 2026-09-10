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
      {
        dispenserId: 'd1',
        fuelType: 'DO',
        openingElectronicReading: 1000,
        electronicReading: 1200,
      }, // +200 DO
      { dispenserId: 'd2', fuelType: 'DO', openingElectronicReading: 500, electronicReading: 650 }, // +150 DO
      { dispenserId: 'd3', fuelType: 'E0', openingElectronicReading: null, electronicReading: 300 }, // no opening -> no sale
    ]
    const { sales } = computeShiftSales(readings, dispensers)
    expect(sales).toEqual([{ fuelType: 'DO', liters: 350 }])
  })

  it('counts liters against the fuel stamped on the reading, not the trụ’s current one', () => {
    // Trụ 1 was converted to DC after this ca closed; the ca still sold DO.
    const readings: SaleReading[] = [
      {
        dispenserId: 'd1',
        fuelType: 'DO',
        openingElectronicReading: 1000,
        electronicReading: 1200,
      },
    ]
    const { sales } = computeShiftSales(readings, [{ id: 'd1', fuelType: 'DC' }])
    expect(sales).toEqual([{ fuelType: 'DO', liters: 200 }])
  })

  it('advances every dispenser that has a closing, whatever its delta', () => {
    const readings: SaleReading[] = [
      {
        dispenserId: 'd1',
        fuelType: 'DO',
        openingElectronicReading: 1000,
        electronicReading: 1200,
      }, // +200 -> sale + advance
      { dispenserId: 'd2', fuelType: 'DO', openingElectronicReading: 500, electronicReading: 500 }, // sold nothing -> advance, no sale
      { dispenserId: 'd3', fuelType: 'E0', openingElectronicReading: null, electronicReading: 300 }, // no opening -> advance, no sale
    ]
    const { sales, advances } = computeShiftSales(readings, dispensers)
    expect(sales).toEqual([{ fuelType: 'DO', liters: 200 }])
    expect(advances).toEqual([
      { dispenserId: 'd1', newElectronicReading: 1200, newMechanicalReading: null },
      { dispenserId: 'd2', newElectronicReading: 500, newMechanicalReading: null },
      { dispenserId: 'd3', newElectronicReading: 300, newMechanicalReading: null },
    ])
  })

  it('advances both caches from one reading', () => {
    const readings: SaleReading[] = [
      {
        dispenserId: 'd1',
        fuelType: 'DO',
        openingElectronicReading: 1000,
        electronicReading: 1200,
        openingMechanicalReading: 900,
        mechanicalReading: 1080,
      },
    ]
    const { advances } = computeShiftSales(readings, dispensers)
    expect(advances).toEqual([
      { dispenserId: 'd1', newElectronicReading: 1200, newMechanicalReading: 1080 },
    ])
  })

  it('advances each meter independently — a meter with no closing holds its cache', () => {
    const readings: SaleReading[] = [
      {
        dispenserId: 'd1',
        fuelType: 'DO',
        openingElectronicReading: 1000,
        electronicReading: 1200,
        openingMechanicalReading: 900,
        mechanicalReading: null, // no mechanical photo -> its cache holds
      },
      {
        dispenserId: 'd2',
        fuelType: 'DO',
        openingElectronicReading: 1000,
        electronicReading: null, // no electronic photo -> its cache holds
        openingMechanicalReading: 900,
        mechanicalReading: 1080,
      },
    ]
    const { advances } = computeShiftSales(readings, dispensers)
    expect(advances).toEqual([
      { dispenserId: 'd1', newElectronicReading: 1200, newMechanicalReading: null },
      { dispenserId: 'd2', newElectronicReading: null, newMechanicalReading: 1080 },
    ])
  })

  it('books no sale but still advances on a decreased reading', () => {
    const readings: SaleReading[] = [
      {
        dispenserId: 'd2',
        fuelType: 'DO',
        openingElectronicReading: 500,
        electronicReading: 400,
        openingMechanicalReading: 900,
        mechanicalReading: 850,
      },
    ]
    const { sales, advances } = computeShiftSales(readings, dispensers)
    expect(sales).toEqual([])
    expect(advances).toEqual([
      { dispenserId: 'd2', newElectronicReading: 400, newMechanicalReading: 850 },
    ])
  })

  it('skips a reading whose dispenser is unknown', () => {
    const readings: SaleReading[] = [
      { dispenserId: 'ghost', fuelType: 'DO', openingElectronicReading: 1, electronicReading: 2 },
    ]
    expect(computeShiftSales(readings, dispensers)).toEqual({ sales: [], advances: [] })
  })
})
