import { describe, expect, it } from 'vitest'

import { FuelArea } from '@/lib/generated/prisma/client'
import {
  buildPriceTimeline,
  buildRetailPriceBoard,
  planKyPriceSave,
} from '@/lib/misa-export/retail-price-board'

const TODAY = new Date('2026-08-18')

/** A price row as the board receives it — Prisma's Decimal already turned into a number. */
function price(fuelArea: FuelArea, fuelType: string, effectiveDate: string, unitPrice: number) {
  return { fuelArea, fuelType, effectiveDate: new Date(effectiveDate), unitPrice }
}

function cell(board: ReturnType<typeof buildRetailPriceBoard>, fuelType: string, area: FuelArea) {
  const entry = board.find((e) => e.fuelType === fuelType)
  if (entry === undefined) throw new Error(`no board entry for ${fuelType}`)
  return entry.cells[area]
}

describe('buildRetailPriceBoard', () => {
  it('shows all five nhiên liệu in business order even with no prices at all', () => {
    const board = buildRetailPriceBoard([], TODAY)
    expect(board.map((entry) => entry.fuelType)).toEqual(['XANG_A95', 'E0', 'DO', 'DC', 'URE'])
  })

  it('shows the latest price with ngày áp dụng ≤ today, not the newest row keyed in', () => {
    const board = buildRetailPriceBoard(
      [
        price(FuelArea.FUEL_AREA_1, 'DO', '2026-07-20', 23900),
        price(FuelArea.FUEL_AREA_1, 'DO', '2026-06-25', 22290),
      ],
      TODAY
    )
    expect(cell(board, 'DO', FuelArea.FUEL_AREA_1).current).toEqual({
      unitPrice: 23900,
      effectiveDate: new Date('2026-07-20'),
    })
  })

  it('shows a price dated after today as pending, not as the current price', () => {
    const board = buildRetailPriceBoard(
      [
        price(FuelArea.FUEL_AREA_1, 'XANG_A95', '2026-08-14', 22000),
        price(FuelArea.FUEL_AREA_1, 'XANG_A95', '2026-08-25', 23100),
      ],
      TODAY
    )
    expect(cell(board, 'XANG_A95', FuelArea.FUEL_AREA_1)).toEqual({
      current: { unitPrice: 22000, effectiveDate: new Date('2026-08-14') },
      pending: { unitPrice: 23100, effectiveDate: new Date('2026-08-25') },
    })
  })

  it('shows a fuel priced only in the future as pending with no current price', () => {
    const board = buildRetailPriceBoard(
      [price(FuelArea.FUEL_AREA_2, 'URE', '2026-08-25', 15000)],
      TODAY
    )
    expect(cell(board, 'URE', FuelArea.FUEL_AREA_2)).toEqual({
      current: null,
      pending: { unitPrice: 15000, effectiveDate: new Date('2026-08-25') },
    })
  })

  it('shows the next kỳ as pending when several future prices are keyed in', () => {
    const board = buildRetailPriceBoard(
      [
        price(FuelArea.FUEL_AREA_1, 'DC', '2026-09-10', 24500),
        price(FuelArea.FUEL_AREA_1, 'DC', '2026-08-25', 24300),
      ],
      TODAY
    )
    expect(cell(board, 'DC', FuelArea.FUEL_AREA_1).pending).toEqual({
      unitPrice: 24300,
      effectiveDate: new Date('2026-08-25'),
    })
  })

  it('treats a price dated exactly today as in force', () => {
    const board = buildRetailPriceBoard(
      [price(FuelArea.FUEL_AREA_1, 'E0', '2026-08-18', 20100)],
      TODAY
    )
    expect(cell(board, 'E0', FuelArea.FUEL_AREA_1).current).toEqual({
      unitPrice: 20100,
      effectiveDate: new Date('2026-08-18'),
    })
  })

  it('marks the vùng with no price as Chưa có giá while the other shows its price', () => {
    const board = buildRetailPriceBoard(
      [price(FuelArea.FUEL_AREA_1, 'URE', '2026-07-20', 15000)],
      TODAY
    )
    expect(cell(board, 'URE', FuelArea.FUEL_AREA_1).current?.unitPrice).toBe(15000)
    expect(cell(board, 'URE', FuelArea.FUEL_AREA_2).current).toBeNull()
  })

  it('carries a ngày áp dụng per cell, so the two vùng can sit on different dates', () => {
    const board = buildRetailPriceBoard(
      [
        price(FuelArea.FUEL_AREA_1, 'DO', '2026-07-20', 23900),
        price(FuelArea.FUEL_AREA_2, 'DO', '2026-06-25', 24000),
      ],
      TODAY
    )
    expect(cell(board, 'DO', FuelArea.FUEL_AREA_1).current?.effectiveDate).toEqual(
      new Date('2026-07-20')
    )
    expect(cell(board, 'DO', FuelArea.FUEL_AREA_2).current?.effectiveDate).toEqual(
      new Date('2026-06-25')
    )
  })

  it('gives every nhiên liệu a cell for both vùng when no prices exist', () => {
    const board = buildRetailPriceBoard([], TODAY)
    for (const entry of board) {
      for (const area of [FuelArea.FUEL_AREA_1, FuelArea.FUEL_AREA_2]) {
        expect(entry.cells[area]).toEqual({ current: null, pending: null })
      }
    }
  })
})

describe('buildPriceTimeline', () => {
  it('lists every price for the nhiên liệu and vùng, newest ngày áp dụng first', () => {
    const timeline = buildPriceTimeline(
      [
        price(FuelArea.FUEL_AREA_1, 'DO', '2026-06-25', 22290),
        price(FuelArea.FUEL_AREA_1, 'DO', '2026-07-20', 23900),
        price(FuelArea.FUEL_AREA_1, 'DO', '2026-05-10', 21800),
      ],
      FuelArea.FUEL_AREA_1,
      'DO',
      TODAY
    )
    expect(timeline.map((row) => row.effectiveDate)).toEqual([
      new Date('2026-07-20'),
      new Date('2026-06-25'),
      new Date('2026-05-10'),
    ])
  })

  it('marks the price the board shows as current, and no other', () => {
    const timeline = buildPriceTimeline(
      [
        price(FuelArea.FUEL_AREA_1, 'DO', '2026-06-25', 22290),
        price(FuelArea.FUEL_AREA_1, 'DO', '2026-07-20', 23900),
      ],
      FuelArea.FUEL_AREA_1,
      'DO',
      TODAY
    )
    expect(timeline).toEqual([
      { unitPrice: 23900, effectiveDate: new Date('2026-07-20'), isCurrent: true },
      { unitPrice: 22290, effectiveDate: new Date('2026-06-25'), isCurrent: false },
    ])
  })

  it('lists a pending future price without marking it current', () => {
    const timeline = buildPriceTimeline(
      [
        price(FuelArea.FUEL_AREA_1, 'XANG_A95', '2026-08-14', 22000),
        price(FuelArea.FUEL_AREA_1, 'XANG_A95', '2026-08-25', 23100),
      ],
      FuelArea.FUEL_AREA_1,
      'XANG_A95',
      TODAY
    )
    expect(timeline).toEqual([
      { unitPrice: 23100, effectiveDate: new Date('2026-08-25'), isCurrent: false },
      { unitPrice: 22000, effectiveDate: new Date('2026-08-14'), isCurrent: true },
    ])
  })

  it('leaves out prices belonging to another vùng or another nhiên liệu', () => {
    const timeline = buildPriceTimeline(
      [
        price(FuelArea.FUEL_AREA_1, 'DO', '2026-07-20', 23900),
        price(FuelArea.FUEL_AREA_2, 'DO', '2026-07-20', 24000),
        price(FuelArea.FUEL_AREA_1, 'DC', '2026-07-20', 24300),
      ],
      FuelArea.FUEL_AREA_1,
      'DO',
      TODAY
    )
    expect(timeline).toEqual([
      { unitPrice: 23900, effectiveDate: new Date('2026-07-20'), isCurrent: true },
    ])
  })

  it('returns nothing for a cell that has never had a price', () => {
    const timeline = buildPriceTimeline(
      [price(FuelArea.FUEL_AREA_1, 'URE', '2026-07-20', 15000)],
      FuelArea.FUEL_AREA_2,
      'URE',
      TODAY
    )
    expect(timeline).toEqual([])
  })

  it('marks no row current when every price for the cell is still in the future', () => {
    const timeline = buildPriceTimeline(
      [price(FuelArea.FUEL_AREA_2, 'URE', '2026-08-25', 15000)],
      FuelArea.FUEL_AREA_2,
      'URE',
      TODAY
    )
    expect(timeline).toEqual([
      { unitPrice: 15000, effectiveDate: new Date('2026-08-25'), isCurrent: false },
    ])
  })
})

/** An existing giá bán lẻ row, as the kỳ planner receives it — with its id. */
function existing(
  id: string,
  fuelArea: FuelArea,
  fuelType: string,
  effectiveDate: string,
  unitPrice: number
) {
  return { id, fuelArea, fuelType, effectiveDate: new Date(effectiveDate), unitPrice }
}

const KY_DATE = new Date('2026-08-25')

describe('planKyPriceSave', () => {
  it('creates a row for a filled cell the kỳ date has no row for', () => {
    const plan = planKyPriceSave([], KY_DATE, [
      { fuelArea: FuelArea.FUEL_AREA_1, fuelType: 'XANG_A95', unitPrice: 23100 },
    ])
    expect(plan).toEqual([
      { kind: 'create', fuelArea: FuelArea.FUEL_AREA_1, fuelType: 'XANG_A95', unitPrice: 23100 },
    ])
  })

  it('updates the row the kỳ date already carries instead of creating a second', () => {
    const plan = planKyPriceSave(
      [existing('row-1', FuelArea.FUEL_AREA_1, 'XANG_A95', '2026-08-25', 23100)],
      KY_DATE,
      [{ fuelArea: FuelArea.FUEL_AREA_1, fuelType: 'XANG_A95', unitPrice: 23400 }]
    )
    expect(plan).toEqual([
      {
        kind: 'update',
        id: 'row-1',
        fuelArea: FuelArea.FUEL_AREA_1,
        fuelType: 'XANG_A95',
        unitPrice: 23400,
        previousUnitPrice: 23100,
      },
    ])
  })

  it('does nothing for a blank cell on a kỳ date with no row for that fuel', () => {
    const plan = planKyPriceSave([], KY_DATE, [
      { fuelArea: FuelArea.FUEL_AREA_1, fuelType: 'URE', unitPrice: null },
    ])
    expect(plan).toEqual([])
  })

  it('leaves the row the kỳ date already carries untouched when the cell is blank', () => {
    const plan = planKyPriceSave(
      [existing('row-1', FuelArea.FUEL_AREA_1, 'URE', '2026-08-25', 15000)],
      KY_DATE,
      [{ fuelArea: FuelArea.FUEL_AREA_1, fuelType: 'URE', unitPrice: null }]
    )
    expect(plan).toEqual([])
  })

  it('updates rather than creates when the cell holds the value that date already has', () => {
    const plan = planKyPriceSave(
      [existing('row-1', FuelArea.FUEL_AREA_2, 'DO', '2026-08-25', 24000)],
      KY_DATE,
      [{ fuelArea: FuelArea.FUEL_AREA_2, fuelType: 'DO', unitPrice: 24000 }]
    )
    expect(plan).toEqual([
      {
        kind: 'update',
        id: 'row-1',
        fuelArea: FuelArea.FUEL_AREA_2,
        fuelType: 'DO',
        unitPrice: 24000,
        previousUnitPrice: 24000,
      },
    ])
  })

  it('resolves each vùng on its own, so one fuel can create in one and update in the other', () => {
    const plan = planKyPriceSave(
      [existing('row-1', FuelArea.FUEL_AREA_1, 'DC', '2026-08-25', 24300)],
      KY_DATE,
      [
        { fuelArea: FuelArea.FUEL_AREA_1, fuelType: 'DC', unitPrice: 24350 },
        { fuelArea: FuelArea.FUEL_AREA_2, fuelType: 'DC', unitPrice: 24430 },
      ]
    )
    expect(plan.map((op) => op.kind)).toEqual(['update', 'create'])
  })

  it('creates when the fuel has a row on another date, since a kỳ only edits its own date', () => {
    const plan = planKyPriceSave(
      [existing('row-1', FuelArea.FUEL_AREA_1, 'E0', '2026-06-25', 20100)],
      KY_DATE,
      [{ fuelArea: FuelArea.FUEL_AREA_1, fuelType: 'E0', unitPrice: 20500 }]
    )
    expect(plan).toEqual([
      { kind: 'create', fuelArea: FuelArea.FUEL_AREA_1, fuelType: 'E0', unitPrice: 20500 },
    ])
  })

  it('writes nothing for a kỳ whose every cell is blank', () => {
    const plan = planKyPriceSave(
      [existing('row-1', FuelArea.FUEL_AREA_1, 'DO', '2026-08-25', 23900)],
      KY_DATE,
      [
        { fuelArea: FuelArea.FUEL_AREA_1, fuelType: 'DO', unitPrice: null },
        { fuelArea: FuelArea.FUEL_AREA_2, fuelType: 'DO', unitPrice: null },
      ]
    )
    expect(plan).toEqual([])
  })
})
