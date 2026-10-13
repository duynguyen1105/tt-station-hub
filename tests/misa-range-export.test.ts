import { describe, expect, it } from 'vitest'

import {
  type RangeShiftBuild,
  buildMisaRangeExport,
  concatVoucherMatrices,
} from '@/lib/misa-export/build-range-export'
import type {
  FuelSummary,
  MisaBuildResult,
  MisaSalesRow,
  PreflightError,
  PreflightWarning,
} from '@/lib/misa-export/build-sales-voucher'

function row(customerCode: string): MisaSalesRow {
  return {
    kind: 'credit',
    paymentMethod: 0,
    postingDate: '01/08/2026',
    voucherDate: '01/08/2026',
    invoiceDate: '01/08/2026',
    customerCode,
    salesperson: customerCode,
    productCode: 'DO',
    productName: 'Dầu DO',
    debitAccount: '131',
    revenueAccount: '5111',
    quantity: 10,
    unitPrice: 20000,
    amount: 200000,
    warehouse: 'K1',
    costAccount: '632',
    stockAccount: '1561',
  }
}

function fuel(
  fuelType: string,
  metered: number,
  airPurge: number | null,
  credit: number
): FuelSummary {
  return {
    fuelType,
    meteredLiters: metered,
    airPurgeLiters: airPurge,
    creditLiters: credit,
    cashLiters: metered - (airPurge ?? 0) - credit,
  }
}

const ERROR: PreflightError = { code: 'missing_fuel_map', fuelType: 'DO', message: 'no map' }
const WARNING: PreflightWarning = {
  code: 'negative_cash_liters',
  fuelType: 'DO',
  meteredLiters: 5,
  creditLiters: 10,
  message: 'negative',
}

function shift(
  shiftId: string,
  result: Partial<MisaBuildResult>,
  cashCounts = { receipt: 0, payment: 0 }
): RangeShiftBuild {
  return {
    shiftId,
    stationCode: 'DAKNONG_1',
    shiftDate: new Date('2026-08-01T00:00:00.000Z'),
    result: { rows: [], errors: [], warnings: [], fuelSummary: [], ...result },
    cashCounts,
  }
}

describe('buildMisaRangeExport', () => {
  it('lists every ca’s rows after the one before, in the order the ca were given', () => {
    const built = buildMisaRangeExport([
      shift('s1', { rows: [row('A'), row('B')] }),
      shift('s2', { rows: [] }),
      shift('s3', { rows: [row('C')] }),
    ])
    expect(built.shiftCount).toBe(3)
    expect(built.rows.map((r) => r.customerCode)).toEqual(['A', 'B', 'C'])
  })

  it('sums the litres per nhiên liệu across ca', () => {
    const built = buildMisaRangeExport([
      shift('s1', { fuelSummary: [fuel('DO', 100, 2, 30), fuel('A95', 50, null, 0)] }),
      shift('s2', { fuelSummary: [fuel('DO', 200, null, 20)] }),
    ])
    expect(built.fuelSummary).toEqual([
      { fuelType: 'DO', meteredLiters: 300, airPurgeLiters: 2, creditLiters: 50, cashLiters: 248 },
      fuel('A95', 50, null, 0),
    ])
  })

  it('leaves Xả gió blank for a nhiên liệu no ca purged, but keeps a keyed-in 0', () => {
    const blank = buildMisaRangeExport([
      shift('s1', { fuelSummary: [fuel('DO', 10, null, 0)] }),
      shift('s2', { fuelSummary: [fuel('DO', 10, null, 0)] }),
    ])
    expect(blank.fuelSummary[0]?.airPurgeLiters).toBeNull()
    const zero = buildMisaRangeExport([
      shift('s1', { fuelSummary: [fuel('DO', 10, null, 0)] }),
      shift('s2', { fuelSummary: [fuel('DO', 10, 0, 0)] }),
    ])
    expect(zero.fuelSummary[0]?.airPurgeLiters).toBe(0)
  })

  it('names only the ca with an error or a warning, with their ngày', () => {
    const built = buildMisaRangeExport([
      shift('ok', {}),
      shift('broken', { errors: [ERROR] }),
      shift('warned', { warnings: [WARNING] }),
    ])
    expect(built.problems).toEqual([
      {
        shiftId: 'broken',
        stationCode: 'DAKNONG_1',
        shiftDate: '2026-08-01',
        errors: [ERROR],
        warnings: [],
      },
      {
        shiftId: 'warned',
        stationCode: 'DAKNONG_1',
        shiftDate: '2026-08-01',
        errors: [],
        warnings: [WARNING],
      },
    ])
  })

  it('sums the Phiếu thu / Phiếu chi lines', () => {
    const built = buildMisaRangeExport([
      shift('s1', {}, { receipt: 2, payment: 1 }),
      shift('s2', {}, { receipt: 0, payment: 3 }),
    ])
    expect(built.cashVoucherCounts).toEqual({ receipt: 2, payment: 4 })
  })

  it('answers an empty khoảng with nothing', () => {
    expect(buildMisaRangeExport([])).toEqual({
      shiftCount: 0,
      rows: [],
      fuelSummary: [],
      problems: [],
      cashVoucherCounts: { receipt: 0, payment: 0 },
    })
  })
})

describe('concatVoucherMatrices', () => {
  const header = ['Ngày', 'Số tiền']

  it('keeps the header once and every ca’s lines in turn', () => {
    const matrix = concatVoucherMatrices(header, [
      [header.slice(), ['01/08/2026', 100]],
      [header.slice()],
      [header.slice(), ['02/08/2026', 200], ['02/08/2026', 300]],
    ])
    expect(matrix).toEqual([
      ['Ngày', 'Số tiền'],
      ['01/08/2026', 100],
      ['02/08/2026', 200],
      ['02/08/2026', 300],
    ])
  })

  it('is the header alone when no ca has a line', () => {
    expect(concatVoucherMatrices(header, [])).toEqual([header])
  })
})
