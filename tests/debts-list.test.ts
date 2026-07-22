import { describe, expect, it } from 'vitest'

import {
  type CreditCustomer,
  type CreditVisit,
  buildMisaSalesVoucher,
} from '@/lib/misa-export/build-sales-voucher'
import {
  type DebtCustomerInput,
  type DebtVisitInput,
  buildDebtsList,
  shiftDayWindow,
} from '@/lib/misa-export/debts-list'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

// shiftDate is UTC-midnight labelled with the Vietnam (GMT+7) calendar day.
const SHIFT_DATE = new Date('2026-06-27T00:00:00.000Z')

describe('shiftDayWindow', () => {
  it('starts 7h before the labelled UTC-midnight (Vietnam day start)', () => {
    const { start } = shiftDayWindow(SHIFT_DATE)
    expect(start.getTime()).toBe(SHIFT_DATE.getTime() - 7 * HOUR_MS)
  })

  it('ends 17h after the labelled UTC-midnight (24h later, offset back 7h)', () => {
    const { end } = shiftDayWindow(SHIFT_DATE)
    expect(end.getTime()).toBe(SHIFT_DATE.getTime() + 17 * HOUR_MS)
  })

  it('spans exactly 24h', () => {
    const { start, end } = shiftDayWindow(SHIFT_DATE)
    expect(end.getTime() - start.getTime()).toBe(DAY_MS)
  })

  it('includes a visitDate exactly at the start (half-open lower bound)', () => {
    const { start, end } = shiftDayWindow(SHIFT_DATE)
    const at = start.getTime()
    expect(at >= start.getTime() && at < end.getTime()).toBe(true)
  })

  it('excludes a visitDate 1ms before the start', () => {
    const { start, end } = shiftDayWindow(SHIFT_DATE)
    const before = start.getTime() - 1
    expect(before >= start.getTime() && before < end.getTime()).toBe(false)
  })

  it('includes a visitDate 1ms before the end', () => {
    const { start, end } = shiftDayWindow(SHIFT_DATE)
    const justInside = end.getTime() - 1
    expect(justInside >= start.getTime() && justInside < end.getTime()).toBe(true)
  })

  it('excludes a visitDate exactly at the end (half-open upper bound)', () => {
    const { start, end } = shiftDayWindow(SHIFT_DATE)
    const at = end.getTime()
    expect(at >= start.getTime() && at < end.getTime()).toBe(false)
  })
})

// A visit with the fields the list projects; defaults are a plain plate+fuel fill.
function visit(overrides: Partial<DebtVisitInput> = {}): DebtVisitInput {
  return {
    customerId: 'c1',
    visitDate: new Date('2026-06-27T02:00:00.000Z'),
    fuelType: 'DO',
    litersRead: 100,
    plateRead: '50E-75317',
    plateConfirmed: null,
    ...overrides,
  }
}

const listCustomers = new Map<string, DebtCustomerInput>([
  ['c1', { name: 'Quang Dũng', misaCode: 'QD' }],
  ['c2', { name: 'Ngọc Hồng', misaCode: 'NGỌC HỒNG' }],
  ['c3', { name: 'Khách lẻ', misaCode: null }],
])

describe('buildDebtsList', () => {
  it('uses the confirmed plate over the read plate for the id', () => {
    const [row] = buildDebtsList(
      [visit({ plateRead: '50E-00000', plateConfirmed: '50E-75317' })],
      listCustomers
    )
    expect(row?.id).toBe('50E-75317')
    expect(row?.idIsMissing).toBe(false)
  })

  it('falls back to the read plate when there is no confirmed plate', () => {
    const [row] = buildDebtsList([visit({ plateConfirmed: null })], listCustomers)
    expect(row?.id).toBe('50E-75317')
  })

  it('uses the customer MISA code for a plate-less (walk-in) visit', () => {
    const [row] = buildDebtsList(
      [visit({ plateRead: null, plateConfirmed: null, customerId: 'c2' })],
      listCustomers
    )
    expect(row?.id).toBe('NGỌC HỒNG')
    expect(row?.idIsMissing).toBe(false)
  })

  it('flags a missing id when there is no plate and no customer MISA code', () => {
    const [row] = buildDebtsList(
      [visit({ plateRead: null, plateConfirmed: null, customerId: 'c3' })],
      listCustomers
    )
    expect(row?.id).toBe('')
    expect(row?.idIsMissing).toBe(true)
  })

  it('flags a missing id when a plate-less visit was never assigned a customer', () => {
    const [row] = buildDebtsList(
      [visit({ plateRead: null, plateConfirmed: null, customerId: null })],
      listCustomers
    )
    expect(row?.idIsMissing).toBe(true)
    expect(row?.customerName).toBe('')
  })

  it('resolves the customer name and Vietnamese fuel label', () => {
    const [row] = buildDebtsList([visit({ fuelType: 'E0', customerId: 'c2' })], listCustomers)
    expect(row?.customerName).toBe('Ngọc Hồng')
    expect(row?.fuelLabel).toBe('Xăng E0')
  })

  it('carries the AI-read litres through', () => {
    const [row] = buildDebtsList([visit({ litersRead: 42.5 })], listCustomers)
    expect(row?.liters).toBe(42.5)
  })

  it('orders rows by visitDate ascending regardless of input order', () => {
    const rows = buildDebtsList(
      [
        visit({ litersRead: 3, visitDate: new Date('2026-06-27T05:00:00.000Z') }),
        visit({ litersRead: 1, visitDate: new Date('2026-06-27T01:00:00.000Z') }),
        visit({ litersRead: 2, visitDate: new Date('2026-06-27T03:00:00.000Z') }),
      ],
      listCustomers
    )
    expect(rows.map((r) => r.liters)).toEqual([1, 2, 3])
  })

  it('returns an empty list for no visits', () => {
    expect(buildDebtsList([], listCustomers)).toEqual([])
  })
})

// The list and the ca's MISA excel must contain the same debt visits. This fixture
// feeds one shared set of visits through both builders and checks the list rows
// correspond one-to-one to the credit rows (same customer, fuel, litres).
describe('buildDebtsList ↔ buildMisaSalesVoucher consistency', () => {
  const SALE_DATE = new Date('2026-06-27')
  const PRICE_DATE = new Date('2026-06-25')

  const stationConfig = {
    revenueAccount: '5111',
    costAccount: '632',
    stockAccount: '1561',
    creditDebitAccount: '131',
    cashDebitAccount: '11111',
  }
  const fuelMap = [
    { fuelType: 'DO', productCode: 'DO', productName: 'Dầu DO', warehouseCode: 'TT-DN1' },
    { fuelType: 'E0', productCode: 'XA E0', productName: 'Xăng E5', warehouseCode: 'TT-DN1' },
  ]
  const prices = [
    { fuelType: 'DO', effectiveDate: PRICE_DATE, unitPrice: 22290 },
    { fuelType: 'E0', effectiveDate: PRICE_DATE, unitPrice: 20300 },
  ]

  // One shared source: (visitId, customerId, fuel, litres, plate, visitDate).
  const source = [
    {
      id: 'v1',
      customerId: 'c1',
      fuelType: 'DO',
      litersRead: 100,
      plate: '50E-75317',
      visitDate: new Date('2026-06-27T01:00:00.000Z'),
    },
    {
      id: 'v2',
      customerId: 'c2',
      fuelType: 'E0',
      litersRead: 50,
      plate: '50H-76402',
      visitDate: new Date('2026-06-27T02:00:00.000Z'),
    },
  ]

  const misaCustomers: CreditCustomer[] = [
    { id: 'c1', name: 'Quang Dũng', misaCode: 'QD' },
    { id: 'c2', name: 'Ngọc Hồng', misaCode: 'NGỌC HỒNG' },
  ]

  it('lists exactly the credit rows the MISA export emits (customer, fuel, litres)', () => {
    const misa = buildMisaSalesVoucher({
      saleDate: SALE_DATE,
      stationConfig,
      fuelMap,
      prices,
      readings: [{ dispenserId: 'd1', openingElectronicReading: 1000, electronicReading: 1300 }],
      dispensers: [{ id: 'd1', fuelType: 'DO' }],
      creditVisits: source.map(
        (s): CreditVisit => ({
          id: s.id,
          customerId: s.customerId,
          fuelType: s.fuelType,
          litersRead: s.litersRead,
          unitPriceRead: null,
          computedAmount: null,
          plate: s.plate,
        })
      ),
      customers: misaCustomers,
    })
    expect(misa.errors).toEqual([])

    const listCustomersById = new Map<string, DebtCustomerInput>(
      misaCustomers.map((c) => [c.id, { name: c.name, misaCode: c.misaCode }])
    )
    const list = buildDebtsList(
      source.map(
        (s): DebtVisitInput => ({
          customerId: s.customerId,
          visitDate: s.visitDate,
          fuelType: s.fuelType,
          litersRead: s.litersRead,
          plateRead: s.plate,
          plateConfirmed: null,
        })
      ),
      listCustomersById
    )

    const creditRows = misa.rows.filter((r) => r.kind === 'credit')
    expect(list).toHaveLength(creditRows.length)

    const customerNameByMisaCode = new Map(misaCustomers.map((c) => [c.misaCode, c.name]))
    for (let i = 0; i < list.length; i++) {
      const listRow = list[i]
      const creditRow = creditRows[i]
      expect(listRow?.idIsMissing).toBe(false)
      expect(listRow?.customerName).toBe(customerNameByMisaCode.get(creditRow?.customerCode ?? ''))
      expect(listRow?.fuelLabel).toBe(fuelTypeLabelFor(creditRow?.productCode))
      expect(listRow?.liters).toBe(creditRow?.quantity)
    }
  })
})

// The fixture's fuel map productCode → the same Vietnamese label the list renders.
function fuelTypeLabelFor(productCode: string | undefined): string {
  if (productCode === 'DO') return 'Dầu DO'
  if (productCode === 'XA E0') return 'Xăng E0'
  return productCode ?? ''
}
