import { describe, expect, it } from 'vitest'

import { FuelArea } from '@/lib/generated/prisma/client'
import { buildRetailPriceBoard } from '@/lib/misa-export/retail-price-board'

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
