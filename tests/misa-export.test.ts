import ExcelJS from 'exceljs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import {
  type CreditCustomer,
  type CreditVisit,
  MISA_SALES_COLUMNS,
  MISA_SHEET_NAME,
  type MisaBuildInput,
  type SaleDispenser,
  type SaleReading,
  buildMisaSalesVoucher,
  inferFuelTypeFromPrice,
  misaRowsToMatrix,
} from '@/lib/misa-export/build-sales-voucher'
import { misaRowsToXlsxBuffer } from '@/lib/misa-export/shift-to-excel'

// Fixtures reproduce a DAKNONG1 day (sale date 27/06/2026) using the seeded values.
const SALE_DATE = new Date('2026-06-27')
const PRICE_DATE = new Date('2026-06-25')

const config = {
  revenueAccount: '5111',
  costAccount: '632',
  stockAccount: '1561',
  creditDebitAccount: '131',
  cashDebitAccount: '11111',
}

const fuelMap = [
  { fuelType: 'DO', productCode: 'DO', productName: 'Dầu DO', warehouseCode: 'TT-DN1' },
  { fuelType: 'E0', productCode: 'XA E0', productName: 'Xăng E5', warehouseCode: 'TT-DN1' },
  { fuelType: 'DC', productCode: 'DO01', productName: 'Dầu DO 0,001S', warehouseCode: 'TT-DN1' },
  {
    fuelType: 'URE',
    productCode: 'URE',
    productName: 'Dung dịch URE',
    warehouseCode: 'KHONHOTDAKNONG1',
  },
]

const prices = [
  { fuelType: 'DO', effectiveDate: PRICE_DATE, unitPrice: 22290 },
  { fuelType: 'E0', effectiveDate: PRICE_DATE, unitPrice: 20300 },
  { fuelType: 'DC', effectiveDate: PRICE_DATE, unitPrice: 24430 },
  { fuelType: 'URE', effectiveDate: PRICE_DATE, unitPrice: 15000 },
]

// Metered: DO 300 (d1: 1000→1300), E0 200 (d2: 500→700). The opening lives on
// the reading; the dispenser contributes only its fuel type.
const dispensers: SaleDispenser[] = [
  { id: 'd1', fuelType: 'DO' },
  { id: 'd2', fuelType: 'E0' },
]
const readings: SaleReading[] = [
  { dispenserId: 'd1', openingElectronicReading: 1000, electronicReading: 1300 },
  { dispenserId: 'd2', openingElectronicReading: 500, electronicReading: 700 },
]

const customers: CreditCustomer[] = [
  { id: 'c1', name: 'Quang Dũng', misaCode: 'QD' },
  { id: 'c2', name: 'Ngọc Hồng', misaCode: 'NGỌC HỒNG' },
]

// Credit: 100 L DO for QD, 50 L E0 for Ngọc Hồng.
const creditVisits: CreditVisit[] = [
  {
    id: 'v1',
    customerId: 'c1',
    fuelType: 'DO',
    litersRead: 100,
    unitPriceRead: 22290,
    computedAmount: 2229000,
    plate: '50E-75317',
  },
  {
    id: 'v2',
    customerId: 'c2',
    fuelType: 'E0',
    litersRead: 50,
    unitPriceRead: 20300,
    computedAmount: 1015000,
    plate: '50H-76402',
  },
]

function baseInput(overrides: Partial<MisaBuildInput> = {}): MisaBuildInput {
  return {
    saleDate: SALE_DATE,
    stationConfig: config,
    fuelMap,
    prices,
    readings,
    dispensers,
    creditVisits,
    customers,
    ...overrides,
  }
}

describe('buildMisaSalesVoucher — header', () => {
  it('emits the exact 49-column header and sheet name from the real template', () => {
    const templatePath = fileURLToPath(
      new URL('../lib/misa-export/Ban_hang_template.xls', import.meta.url)
    )
    const wb = XLSX.read(readFileSync(templatePath), { type: 'buffer' })
    const ws = wb.Sheets[MISA_SHEET_NAME]
    expect(ws).toBeDefined()
    const templateHeader = (XLSX.utils.sheet_to_json(ws!, { header: 1, raw: true })[0] ??
      []) as string[]

    expect(MISA_SHEET_NAME).toBe('Chứng từ bán hàng')
    expect(MISA_SALES_COLUMNS).toHaveLength(49)
    expect([...MISA_SALES_COLUMNS]).toEqual(templateHeader)
    // misaRowsToMatrix carries the header as its first row.
    expect(misaRowsToMatrix([])[0]).toEqual([...MISA_SALES_COLUMNS])
  })
})

describe('buildMisaSalesVoucher — credit rows (bán nợ)', () => {
  it('produces one credit row per credit visit with the right fields', () => {
    const { rows, errors } = buildMisaSalesVoucher(baseInput())
    expect(errors).toEqual([])

    const credit = rows.filter((r) => r.kind === 'credit')
    expect(credit).toHaveLength(2)

    const doRow = credit.find((r) => r.productCode === 'DO')
    expect(doRow).toMatchObject({
      paymentMethod: 0,
      customerCode: 'QD',
      salesperson: '75317', // plate digits from 50E-75317
      productCode: 'DO',
      productName: 'Dầu DO', // Tên hàng from the fuel map
      debitAccount: '131',
      revenueAccount: '5111',
      quantity: 100,
      unitPrice: 22290, // config retail price (not the pump-read price)
      amount: 2229000, // 100 × 22290
      warehouse: 'TT-DN1',
      costAccount: '632',
      stockAccount: '1561',
    })

    const e0Row = credit.find((r) => r.productCode === 'XA E0')
    expect(e0Row).toMatchObject({
      customerCode: 'NGỌC HỒNG',
      salesperson: '76402',
      quantity: 50,
      unitPrice: 20300,
      amount: 1015000,
    })
  })

  it('prices credit rows from the config retail price, not the pump-read price', () => {
    const { rows } = buildMisaSalesVoucher(
      baseInput({
        creditVisits: [
          {
            id: 'v1',
            customerId: 'c1',
            fuelType: 'DO',
            litersRead: 100,
            unitPriceRead: 21000, // pump read a DIFFERENT price than config (22290)
            computedAmount: 2100000,
            plate: '50E-75317',
          },
        ],
      })
    )
    const doRow = rows.find((r) => r.kind === 'credit' && r.productCode === 'DO')
    expect(doRow?.unitPrice).toBe(22290) // config price wins
    expect(doRow?.amount).toBe(2229000) // 100 × 22290, not 100 × 21000
  })

  it('blocks a credit-only fuel with no configured price', () => {
    const result = buildMisaSalesVoucher(
      baseInput({
        prices: prices.filter((p) => p.fuelType !== 'DC'),
        readings: [], // no metered cash rows — DC appears only on credit
        dispensers: [],
        creditVisits: [
          {
            id: 'v1',
            customerId: 'c1',
            fuelType: 'DC',
            litersRead: 40,
            unitPriceRead: 24430,
            computedAmount: 977200,
            plate: '50E-75317',
          },
        ],
      })
    )
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'missing_price', fuelType: 'DC' })
    )
  })
})

describe('buildMisaSalesVoucher — voucher dates (H/I/N)', () => {
  it('defaults all three date columns to the sale date', () => {
    const { rows } = buildMisaSalesVoucher(baseInput())
    for (const r of rows) {
      expect(r.postingDate).toBe('27/06/2026')
      expect(r.voucherDate).toBe('27/06/2026')
      expect(r.invoiceDate).toBe('27/06/2026')
    }
  })

  it('carries the accountant-set posting/voucher/invoice dates into H/I/N', () => {
    const { rows } = buildMisaSalesVoucher(
      baseInput({
        postingDate: new Date('2026-06-30'),
        voucherDate: new Date('2026-06-29'),
        invoiceDate: new Date('2026-06-28'),
      })
    )
    const matrix = misaRowsToMatrix(rows)
    // Column indices: H=7 (posting), I=8 (voucher), N=13 (invoice).
    const firstBody = matrix[1]!
    expect(firstBody[7]).toBe('30/06/2026')
    expect(firstBody[8]).toBe('29/06/2026')
    expect(firstBody[13]).toBe('28/06/2026')
    // Column V = Mã hàng (21), W = Tên hàng (22).
    expect(firstBody[21]).toBe('DO')
    expect(firstBody[22]).toBe('Dầu DO')
    // Price selection still keys off the sale date, not the typed dates.
    const doCash = rows.find((r) => r.kind === 'cash' && r.productCode === 'DO')
    expect(doCash?.unitPrice).toBe(22290)
  })
})

describe('buildMisaSalesVoucher — cash rows (bán lẻ)', () => {
  it('produces one cash row per metered fuel, netted against credit liters', () => {
    const { rows } = buildMisaSalesVoucher(baseInput())
    const cash = rows.filter((r) => r.kind === 'cash')
    expect(cash).toHaveLength(2)

    const doCash = cash.find((r) => r.productCode === 'DO')
    expect(doCash).toMatchObject({
      paymentMethod: 1,
      customerCode: 'bl',
      salesperson: '',
      debitAccount: '11111',
      quantity: 200, // metered 300 − credit 100
      unitPrice: 22290,
      amount: 4458000, // 200 × 22290
    })

    const e0Cash = cash.find((r) => r.productCode === 'XA E0')
    expect(e0Cash).toMatchObject({
      quantity: 150, // metered 200 − credit 50
      unitPrice: 20300,
      amount: 3045000,
    })
  })

  it('meters each fuel from the reading’s own opening, so a corrected closing changes the quantity', () => {
    // Correct d1's closing 1300 → 1250: metered DO falls 300 → 250, and the cash
    // row (250 − 100 credit = 150) tracks it. This is what the deleted export
    // reconstruction could not do — the quantity follows the reading's opening.
    const { rows } = buildMisaSalesVoucher(
      baseInput({
        readings: [
          { dispenserId: 'd1', openingElectronicReading: 1000, electronicReading: 1250 },
          { dispenserId: 'd2', openingElectronicReading: 500, electronicReading: 700 },
        ],
      })
    )
    const doCash = rows.find((r) => r.kind === 'cash' && r.productCode === 'DO')
    expect(doCash?.quantity).toBe(150) // metered 250 − credit 100
    expect(doCash?.amount).toBe(3343500) // 150 × 22290
  })
})

describe('buildMisaSalesVoucher — per-fuel summary', () => {
  it('reports metered / credit / cash liters per fuel', () => {
    const { fuelSummary } = buildMisaSalesVoucher(baseInput())

    const doSummary = fuelSummary.find((f) => f.fuelType === 'DO')
    expect(doSummary).toEqual({
      fuelType: 'DO',
      meteredLiters: 300,
      creditLiters: 100,
      cashLiters: 200,
    })

    const e0Summary = fuelSummary.find((f) => f.fuelType === 'E0')
    expect(e0Summary).toEqual({
      fuelType: 'E0',
      meteredLiters: 200,
      creditLiters: 50,
      cashLiters: 150,
    })
  })

  it('reports negative cash liters when credit exceeds metered', () => {
    const { fuelSummary, warnings } = buildMisaSalesVoucher(
      baseInput({
        creditVisits: [
          {
            id: 'v1',
            customerId: 'c1',
            fuelType: 'DO',
            litersRead: 400, // > metered 300
            unitPriceRead: 22290,
            computedAmount: 8916000,
            plate: '50E-75317',
          },
        ],
      })
    )

    expect(fuelSummary.find((f) => f.fuelType === 'DO')?.cashLiters).toBe(-100)
    expect(warnings).toHaveLength(1)
  })

  it('counts credit liters in the summary even when the customer has no MISA code', () => {
    const { fuelSummary, errors } = buildMisaSalesVoucher(
      baseInput({
        customers: [
          { id: 'c1', name: 'Khách mới', misaCode: null },
          { id: 'c2', name: 'Ngọc Hồng', misaCode: 'NGỌC HỒNG' },
        ],
      })
    )
    // Blocking error is raised, but the preview still shows the real credit liters.
    expect(errors).toContainEqual(expect.objectContaining({ code: 'customer_without_misa_code' }))
    expect(fuelSummary.find((f) => f.fuelType === 'DO')?.creditLiters).toBe(100)
  })
})

describe('buildMisaSalesVoucher — preflight warnings', () => {
  it('warns when credit liters exceed metered liters for a fuel', () => {
    const result = buildMisaSalesVoucher(
      baseInput({
        creditVisits: [
          {
            id: 'v1',
            customerId: 'c1',
            fuelType: 'DO',
            litersRead: 400, // > metered 300
            unitPriceRead: 22290,
            computedAmount: 8916000,
            plate: '50E-75317',
          },
        ],
      })
    )

    expect(result.errors).toEqual([])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatchObject({
      code: 'negative_cash_liters',
      fuelType: 'DO',
      meteredLiters: 300,
      creditLiters: 400,
    })
    // The cash row is still produced, with negative quantity.
    const doCash = result.rows.find((r) => r.kind === 'cash' && r.productCode === 'DO')
    expect(doCash?.quantity).toBe(-100)
  })
})

describe('buildMisaSalesVoucher — blocking errors', () => {
  it('blocks when the global MISA config is missing', () => {
    const result = buildMisaSalesVoucher(baseInput({ stationConfig: null }))
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'missing_global_config' }))
    expect(result.rows).toHaveLength(0)
  })

  it('blocks a credit customer without a MISA code', () => {
    const result = buildMisaSalesVoucher(
      baseInput({
        customers: [
          { id: 'c1', name: 'Khách mới', misaCode: null },
          { id: 'c2', name: 'Ngọc Hồng', misaCode: 'NGỌC HỒNG' },
        ],
      })
    )
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'customer_without_misa_code', visitId: 'v1' })
    )
  })

  it('blocks a fuel sold with no configured price', () => {
    const result = buildMisaSalesVoucher({
      ...baseInput(),
      prices: prices.filter((p) => p.fuelType !== 'E0'), // E0 metered but no price
      creditVisits: [], // avoid E0 credit inference relying on the removed price
    })
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'missing_price', fuelType: 'E0' })
    )
  })
})

describe('buildMisaSalesVoucher — dated retail prices', () => {
  // Two dated DO rows: old 22290 (25/06) and new 23000 (26/06).
  const datedPrices = [
    { fuelType: 'DO', effectiveDate: new Date('2026-06-25'), unitPrice: 22290 },
    { fuelType: 'DO', effectiveDate: new Date('2026-06-26'), unitPrice: 23000 },
    { fuelType: 'E0', effectiveDate: PRICE_DATE, unitPrice: 20300 },
  ]

  function doCashPrice(saleDate: Date): number | undefined {
    const { rows } = buildMisaSalesVoucher(
      baseInput({ saleDate, prices: datedPrices, creditVisits: [] })
    )
    return rows.find((r) => r.kind === 'cash' && r.productCode === 'DO')?.unitPrice
  }

  it('prices a shift on/after a new price at that price', () => {
    expect(doCashPrice(new Date('2026-06-27'))).toBe(23000)
    expect(doCashPrice(new Date('2026-06-26'))).toBe(23000)
  })

  it('prices an earlier shift at the prior price', () => {
    expect(doCashPrice(new Date('2026-06-25'))).toBe(22290)
  })
})

describe('inferFuelTypeFromPrice', () => {
  it('resolves each sample price to the right fuel', () => {
    expect(inferFuelTypeFromPrice(22290, prices, SALE_DATE)).toBe('DO')
    expect(inferFuelTypeFromPrice(20300, prices, SALE_DATE)).toBe('E0')
    expect(inferFuelTypeFromPrice(24430, prices, SALE_DATE)).toBe('DC')
    expect(inferFuelTypeFromPrice(15000, prices, SALE_DATE)).toBe('URE')
    expect(inferFuelTypeFromPrice(99999, prices, SALE_DATE)).toBeNull()
  })
})

describe('misaRowsToXlsxBuffer — template styling', () => {
  it('applies the two header fills, bold headers, and per-column input notes', async () => {
    const { rows } = buildMisaSalesVoucher(baseInput())
    const wb = new ExcelJS.Workbook()
    // exceljs ships a broken global `Buffer` type, so cast at its load() boundary.
    const bytes = await misaRowsToXlsxBuffer(rows)
    await wb.xlsx.load(bytes as unknown as Parameters<typeof wb.xlsx.load>[0])
    const ws = wb.getWorksheet(MISA_SHEET_NAME)
    expect(ws).toBeDefined()

    // A→U grey-lavender, V→AW yellow; header cells bold.
    const fillArgb = (addr: string) => {
      const fill = ws!.getCell(addr).fill
      return fill.type === 'pattern' ? fill.fgColor?.argb : undefined
    }
    expect(fillArgb('A1')).toBe('FFCCCCFF')
    expect(fillArgb('U1')).toBe('FFCCCCFF') // NV bán hàng — last grey column
    expect(fillArgb('V1')).toBe('FFFFFF00') // Mã hàng (*) — first yellow column
    expect(fillArgb('AW1')).toBe('FFFFFF00')
    expect(ws!.getCell('A1').font?.bold).toBe(true)

    // The "MISA SME.NET" input note is present on a column (data validation prompt).
    expect(ws!.getCell('A1').dataValidation?.promptTitle).toBe('MISA SME.NET')
  })

  it('formats the numeric columns for the Vietnamese-locale view', async () => {
    const { rows } = buildMisaSalesVoucher(baseInput())
    expect(rows.length).toBeGreaterThan(0)
    const wb = new ExcelJS.Workbook()
    const bytes = await misaRowsToXlsxBuffer(rows)
    await wb.xlsx.load(bytes as unknown as Parameters<typeof wb.xlsx.load>[0])
    const ws = wb.getWorksheet(MISA_SHEET_NAME)

    // Grouped display; values stay numeric so MISA still imports them.
    expect(ws!.getCell('AB2').numFmt).toBe('#,##0.00') // Số lượng (col 28)
    expect(ws!.getCell('AD2').numFmt).toBe('#,##0') // Đơn giá (col 30)
    expect(ws!.getCell('AE2').numFmt).toBe('#,##0') // Thành tiền (col 31)
    expect(typeof ws!.getCell('AE2').value).toBe('number')
  })

  it('produces a byte-identical file on re-export (deterministic)', async () => {
    const { rows } = buildMisaSalesVoucher(baseInput())
    const a = await misaRowsToXlsxBuffer(rows)
    const b = await misaRowsToXlsxBuffer(rows)
    expect(a.toString('base64')).toBe(b.toString('base64'))
  })
})
