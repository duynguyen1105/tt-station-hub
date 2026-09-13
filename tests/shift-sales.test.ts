import { describe, expect, it } from 'vitest'

import {
  type SaleDispenser,
  type SaleReading,
  computeShiftSales,
} from '@/lib/inventory/shift-sales'
import { soldLiters } from '@/lib/shifts/reading-totals'

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
        airPurgeLiters: null,
      }, // +200 DO
      {
        dispenserId: 'd2',
        fuelType: 'DO',
        openingElectronicReading: 500,
        electronicReading: 650,
        airPurgeLiters: null,
      }, // +150 DO
      {
        dispenserId: 'd3',
        fuelType: 'E0',
        openingElectronicReading: null,
        electronicReading: 300,
        airPurgeLiters: null,
      }, // no opening -> no sale
    ]
    const { sales } = computeShiftSales(readings, dispensers)
    expect(sales).toEqual([
      { fuelType: 'DO', liters: 350, meteredLiters: 350, airPurgeLiters: null },
    ])
  })

  it('counts liters against the fuel stamped on the reading, not the trụ’s current one', () => {
    // Trụ 1 was converted to DC after this ca closed; the ca still sold DO.
    const readings: SaleReading[] = [
      {
        dispenserId: 'd1',
        fuelType: 'DO',
        openingElectronicReading: 1000,
        electronicReading: 1200,
        airPurgeLiters: null,
      },
    ]
    const { sales } = computeShiftSales(readings, [{ id: 'd1', fuelType: 'DC' }])
    expect(sales).toEqual([
      { fuelType: 'DO', liters: 200, meteredLiters: 200, airPurgeLiters: null },
    ])
  })

  it('advances every dispenser that has a closing, whatever its delta', () => {
    const readings: SaleReading[] = [
      {
        dispenserId: 'd1',
        fuelType: 'DO',
        openingElectronicReading: 1000,
        electronicReading: 1200,
        airPurgeLiters: null,
      }, // +200 -> sale + advance
      {
        dispenserId: 'd2',
        fuelType: 'DO',
        openingElectronicReading: 500,
        electronicReading: 500,
        airPurgeLiters: null,
      }, // sold nothing -> advance, no sale
      {
        dispenserId: 'd3',
        fuelType: 'E0',
        openingElectronicReading: null,
        electronicReading: 300,
        airPurgeLiters: null,
      }, // no opening -> advance, no sale
    ]
    const { sales, advances } = computeShiftSales(readings, dispensers)
    expect(sales).toEqual([
      { fuelType: 'DO', liters: 200, meteredLiters: 200, airPurgeLiters: null },
    ])
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
        airPurgeLiters: null,
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
        airPurgeLiters: null,
        openingMechanicalReading: 900,
        mechanicalReading: null, // no mechanical photo -> its cache holds
      },
      {
        dispenserId: 'd2',
        fuelType: 'DO',
        openingElectronicReading: 1000,
        electronicReading: null, // no electronic photo -> its cache holds
        airPurgeLiters: null,
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
        airPurgeLiters: null,
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
      {
        dispenserId: 'ghost',
        fuelType: 'DO',
        openingElectronicReading: 1,
        electronicReading: 2,
        airPurgeLiters: null,
      },
    ]
    expect(computeShiftSales(readings, dispensers)).toEqual({ sales: [], advances: [] })
  })
})

describe('computeShiftSales under a xả gió', () => {
  it('deducts the litres sold, not the litres the đồng hồ counted', () => {
    // 200 lít through the meter, 20 of them pushed back into the hầm as air: the hầm
    // gave up 180. One already-net subtraction — no second movement puts the 20 back.
    const readings: SaleReading[] = [
      {
        dispenserId: 'd1',
        fuelType: 'DO',
        openingElectronicReading: 1000,
        electronicReading: 1200,
        airPurgeLiters: 20,
      },
    ]
    const { sales } = computeShiftSales(readings, dispensers)
    expect(sales).toEqual([{ fuelType: 'DO', liters: 180, meteredLiters: 200, airPurgeLiters: 20 }])
  })

  it('comes off only the fuel of the trụ that pushed the air', () => {
    const readings: SaleReading[] = [
      {
        dispenserId: 'd1',
        fuelType: 'DO',
        openingElectronicReading: 1000,
        electronicReading: 1200,
        airPurgeLiters: 20,
      },
      {
        dispenserId: 'd3',
        fuelType: 'E0',
        openingElectronicReading: 500,
        electronicReading: 700,
        airPurgeLiters: null,
      },
    ]
    const { sales } = computeShiftSales(readings, dispensers)
    expect(sales).toEqual([
      { fuelType: 'DO', liters: 180, meteredLiters: 200, airPurgeLiters: 20 },
      { fuelType: 'E0', liters: 200, meteredLiters: 200, airPurgeLiters: null },
    ])
  })

  it('takes both purges off when two trụ of the same fuel each pushed air', () => {
    const readings: SaleReading[] = [
      {
        dispenserId: 'd1',
        fuelType: 'DO',
        openingElectronicReading: 1000,
        electronicReading: 1200,
        airPurgeLiters: 20,
      },
      {
        dispenserId: 'd2',
        fuelType: 'DO',
        openingElectronicReading: 500,
        electronicReading: 650,
        airPurgeLiters: 5,
      },
    ]
    const { sales } = computeShiftSales(readings, dispensers)
    expect(sales).toEqual([
      { fuelType: 'DO', liters: 325, meteredLiters: 350, airPurgeLiters: 25 }, // (200 − 20) + (150 − 5)
    ])
  })

  it('still advances the trụ cache to the raw meter value', () => {
    // The totalizer really does read 1200 now — the purged lít passed through it.
    const readings: SaleReading[] = [
      {
        dispenserId: 'd1',
        fuelType: 'DO',
        openingElectronicReading: 1000,
        electronicReading: 1200,
        airPurgeLiters: 20,
        openingMechanicalReading: 900,
        mechanicalReading: 1100,
      },
    ]
    const { advances } = computeShiftSales(readings, dispensers)
    expect(advances).toEqual([
      { dispenserId: 'd1', newElectronicReading: 1200, newMechanicalReading: 1100 },
    ])
  })

  it('gives the hầm up nothing, and still advances, when the whole ca was xả gió', () => {
    const readings: SaleReading[] = [
      {
        dispenserId: 'd1',
        fuelType: 'DO',
        openingElectronicReading: 1000,
        electronicReading: 1200,
        airPurgeLiters: 200,
      },
    ]
    const { sales, advances } = computeShiftSales(readings, dispensers)
    expect(sales).toEqual([{ fuelType: 'DO', liters: 0, meteredLiters: 200, airPurgeLiters: 200 }])
    expect(advances).toEqual([
      { dispenserId: 'd1', newElectronicReading: 1200, newMechanicalReading: null },
    ])
  })

  it('subtracts through the shared soldLiters, not a second copy of the arithmetic', () => {
    // 56 − 0.1 is 55.900000000000006 in floating point. soldLiters trims it; a
    // subtraction written separately here would not, and the hầm would drift from the
    // ca screen's Tổng tiền by float dust on every xả gió. The literal is the pin, the
    // comparison is what names the seam.
    const reading: SaleReading = {
      dispenserId: 'd1',
      fuelType: 'DO',
      openingElectronicReading: 1000,
      electronicReading: 1056,
      airPurgeLiters: 0.1,
    }
    const { sales } = computeShiftSales([reading], dispensers)
    expect(sales).toEqual([
      { fuelType: 'DO', liters: 55.9, meteredLiters: 56, airPurgeLiters: 0.1 },
    ])
    expect(sales[0]?.liters).toBe(soldLiters(reading, reading.airPurgeLiters))
  })
})

describe('computeShiftSales reports what the đồng hồ counted beside what it sold', () => {
  it('carries the raw metered litres and the xả gió taken off them', () => {
    const readings: SaleReading[] = [
      {
        dispenserId: 'd1',
        fuelType: 'DO',
        openingElectronicReading: 1000,
        electronicReading: 1200,
        airPurgeLiters: 20,
      },
    ]
    const { sales } = computeShiftSales(readings, dispensers)
    expect(sales).toEqual([{ fuelType: 'DO', liters: 180, meteredLiters: 200, airPurgeLiters: 20 }])
  })

  it('sums the purges of every trụ on a fuel, and the metered litres with them', () => {
    const readings: SaleReading[] = [
      {
        dispenserId: 'd1',
        fuelType: 'DO',
        openingElectronicReading: 1000,
        electronicReading: 1200,
        airPurgeLiters: 20,
      },
      {
        dispenserId: 'd2',
        fuelType: 'DO',
        openingElectronicReading: 500,
        electronicReading: 650,
        airPurgeLiters: 5,
      },
    ]
    const { sales } = computeShiftSales(readings, dispensers)
    expect(sales).toEqual([{ fuelType: 'DO', liters: 325, meteredLiters: 350, airPurgeLiters: 25 }])
  })

  it('leaves a fuel nobody purged with no purge at all, rather than a zero', () => {
    const readings: SaleReading[] = [
      {
        dispenserId: 'd1',
        fuelType: 'DO',
        openingElectronicReading: 1000,
        electronicReading: 1200,
        airPurgeLiters: 20,
      },
      {
        dispenserId: 'd3',
        fuelType: 'E0',
        openingElectronicReading: 500,
        electronicReading: 700,
        airPurgeLiters: null,
      },
    ]
    const { sales } = computeShiftSales(readings, dispensers)
    expect(sales.find((s) => s.fuelType === 'E0')?.airPurgeLiters).toBeNull()
    expect(sales.find((s) => s.fuelType === 'DO')?.airPurgeLiters).toBe(20)
  })

  it('reports a keyed-in zero as a zero, so it reads apart from no purge at all', () => {
    const readings: SaleReading[] = [
      {
        dispenserId: 'd1',
        fuelType: 'DO',
        openingElectronicReading: 1000,
        electronicReading: 1200,
        airPurgeLiters: 0,
      },
    ]
    const { sales } = computeShiftSales(readings, dispensers)
    expect(sales[0]?.airPurgeLiters).toBe(0)
  })

  it('counts a purge keyed on a trụ that sold nothing, rather than losing it', () => {
    // Trụ 2 has no opening, so it sells nothing and its litres never reach the hầm —
    // but kế toán did key a Xả gió on it and the ca screen shows it. Dropping it here
    // would tell the preflight summary that 5 lít of air were never bled.
    const readings: SaleReading[] = [
      {
        dispenserId: 'd1',
        fuelType: 'DO',
        openingElectronicReading: 1000,
        electronicReading: 1200,
        airPurgeLiters: 20,
      },
      {
        dispenserId: 'd2',
        fuelType: 'DO',
        openingElectronicReading: null,
        electronicReading: 650,
        airPurgeLiters: 5,
      },
    ]
    const { sales } = computeShiftSales(readings, dispensers)
    expect(sales).toEqual([{ fuelType: 'DO', liters: 180, meteredLiters: 200, airPurgeLiters: 25 }])
  })

  it('trims the float dust off a summed purge, as the litres beside it are trimmed', () => {
    const readings: SaleReading[] = [
      {
        dispenserId: 'd1',
        fuelType: 'DO',
        openingElectronicReading: 1000,
        electronicReading: 1056,
        airPurgeLiters: 0.1,
      },
      {
        dispenserId: 'd2',
        fuelType: 'DO',
        openingElectronicReading: 500,
        electronicReading: 700,
        airPurgeLiters: 0.2,
      },
    ]
    const { sales } = computeShiftSales(readings, dispensers)
    expect(sales[0]?.airPurgeLiters).toBe(0.3)
    expect(sales[0]?.meteredLiters).toBe(256)
  })
})
