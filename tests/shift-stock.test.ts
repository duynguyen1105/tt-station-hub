import { describe, expect, it } from 'vitest'

import { bookDayOf, fuelStockRows, shiftTankRows } from '@/lib/inventory/shift-stock'

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

const MOVES = [
  { movementType: 'import', quantity: 6000, movementDate: d('2026-08-01') },
  { movementType: 'sale', quantity: -1500, movementDate: d('2026-08-01') },
  { movementType: 'sale', quantity: -2000, movementDate: d('2026-08-02') },
  { movementType: 'adjustment', quantity: -100, movementDate: d('2026-08-02') },
  { movementType: 'import', quantity: 4000, movementDate: d('2026-08-04') },
]

describe('bookDayOf', () => {
  it("reads a day that moved off that day's ledger row", () => {
    expect(bookDayOf(10000, d('2026-08-01'), MOVES, '2026-08-02')).toEqual({
      opening: 14500,
      imported: 0,
      sold: 2000,
      adjusted: -100,
      closing: 12400,
    })
  })

  it('carries the last closing through a day nothing moved, and ignores later days', () => {
    expect(bookDayOf(10000, d('2026-08-01'), MOVES, '2026-08-03')).toEqual({
      opening: 12400,
      imported: 0,
      sold: 0,
      adjusted: 0,
      closing: 12400,
    })
  })

  it('carries the đầu kỳ itself before the first movement', () => {
    expect(bookDayOf(10000, d('2026-07-30'), MOVES, '2026-07-31')?.closing).toBe(10000)
  })

  it('has nothing for a day before the đầu kỳ', () => {
    expect(bookDayOf(10000, d('2026-08-02'), MOVES, '2026-08-01')).toBeNull()
  })
})

const column = (points: [number, number][]) => ({
  minHeightMm: points[0]![0],
  maxHeightMm: points[points.length - 1]![0],
  points: new Map(points),
})

describe('shiftTankRows', () => {
  const barem = new Map([
    [
      'HAM_1',
      column([
        [660, 4498],
        [795, 5841],
      ]),
    ],
  ])

  it('reads the before and after dips against the Barem, in hầm order', () => {
    const rows = shiftTankRows({
      tanks: [
        { code: 'HAM_2', fuelType: 'DC', capacityK: 5 },
        { code: 'HAM_1', fuelType: 'E0', capacityK: 20 },
      ],
      before: [{ tankCode: 'HAM_1', dipValue: 795, fuelType: 'E0' }],
      after: [{ tankCode: 'HAM_1', dipValue: 660, fuelType: 'E0' }],
      barem,
    })
    expect(rows.map((r) => r.tankCode)).toEqual(['HAM_1', 'HAM_2'])
    expect(rows[0]!.before).toEqual({ mm: 795, lookup: { ok: true, liters: 5841 } })
    expect(rows[0]!.after).toEqual({ mm: 660, lookup: { ok: true, liters: 4498 } })
    expect(rows[1]!).toMatchObject({ fuelType: 'DC', capacityK: 5, before: null, after: null })
  })

  it('says why a height has no litres, and asks nothing without a Barem', () => {
    const [refused] = shiftTankRows({
      tanks: [],
      before: [],
      after: [{ tankCode: 'HAM_1', dipValue: 900, fuelType: 'E0' }],
      barem,
    })
    expect(refused!.after?.lookup).toEqual({ ok: false, reason: 'above-maximum' })
    const [unasked] = shiftTankRows({
      tanks: [],
      before: [],
      after: [{ tankCode: 'HAM_1', dipValue: 660, fuelType: 'E0' }],
      barem: null,
    })
    expect(unasked!.after).toEqual({ mm: 660, lookup: null })
  })
})

describe('fuelStockRows', () => {
  const tankRow = (tankCode: string, fuelType: string, liters: number | null) => ({
    tankCode,
    fuelType,
    capacityK: null,
    before: null,
    after: liters === null ? null : { mm: 1, lookup: { ok: true as const, liters } },
  })
  const book = { opening: 4988, imported: 0, sold: 1000, adjusted: 0, closing: 3988 }

  it("adds an open ca's unbooked sales and compares against the hầm", () => {
    const [row] = fuelStockRows({
      fuels: ['E0'],
      bookByFuel: new Map([['E0', book]]),
      provisionalSold: new Map([['E0', 329]]),
      tankRows: [tankRow('HAM_1', 'E0', 4498)],
    })
    expect(row!.book).toEqual({ ...book, sold: 1329, closing: 3659 })
    expect(row!.barem).toBe(4498)
    expect(row!.variance).toBe(839)
  })

  it('sums every hầm of the fuel, and gives up if any hầm is unmeasured', () => {
    const rows = fuelStockRows({
      fuels: ['DO', 'DC', 'XA'],
      bookByFuel: new Map([['DO', book]]),
      provisionalSold: new Map(),
      tankRows: [
        tankRow('HAM_1', 'DO', 1000),
        tankRow('HAM_2', 'DO', 2000),
        tankRow('HAM_3', 'DC', 500),
        tankRow('HAM_4', 'DC', null),
      ],
    })
    expect(rows[0]!).toMatchObject({ barem: 3000, variance: 3000 - 3988 })
    expect(rows[1]!).toMatchObject({ book: null, barem: null, variance: null })
    expect(rows[2]!).toMatchObject({ barem: null, variance: null })
  })
})
