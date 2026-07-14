// Pure MISA sales-voucher builder — the core seam of the MISA export feature
// (issue lib/misa-export/issues/02-misa-builder-and-tests.md). Takes already-loaded
// data and returns the MISA rows plus a preflight result (blocking errors + warnings).
// No I/O, no Prisma, no Excel: the API route and workbook serialization (next slice)
// are thin shells over this.
import {
  type SaleDispenser,
  type SaleReading,
  computeShiftSales,
} from '@/lib/inventory/shift-sales'

export { type SaleDispenser, type SaleReading } from '@/lib/inventory/shift-sales'

export const MISA_SHEET_NAME = 'Chứng từ bán hàng'

// The exact 49-column header of the MISA "Chứng từ bán hàng" import template,
// read verbatim from lib/misa-export/Ban_hang_template.xls (the official blank
// template). Column order and text must match for MISA to accept the import.
export const MISA_SALES_COLUMNS: readonly string[] = [
  'Hiển thị trên sổ',
  'Hình thức bán hàng',
  'Phương thức thanh toán',
  'Kiêm phiếu xuất kho',
  'XK vào khu phi thuế quan và các TH được coi như XK',
  'Lập kèm hóa đơn',
  'Đã lập hóa đơn',
  'Ngày hạch toán (*)',
  'Ngày chứng từ (*)',
  'Số chứng từ (*)',
  'Số phiếu xuất',
  'Lý do xuất',
  'Số hóa đơn',
  'Ngày hóa đơn',
  'Mã khách hàng',
  'Tên khách hàng',
  'Địa chỉ',
  'Mã số thuế',
  'Diễn giải',
  'Nộp vào TK',
  'NV bán hàng',
  'Mã hàng (*)',
  'Tên hàng',
  'Hàng khuyến mại',
  'TK Tiền/Chi phí/Nợ (*)',
  'TK Doanh thu/Có (*)',
  'ĐVT',
  'Số lượng',
  'Đơn giá sau thuế',
  'Đơn giá',
  'Thành tiền',
  'Tỷ lệ CK (%)',
  'Tiền chiết khấu',
  'TK chiết khấu',
  'Giá tính thuế XK',
  '% thuế XK',
  'Tiền thuế XK',
  'TK thuế XK',
  '% thuế GTGT',
  'Tỷ lệ tính thuế (Thuế suất KHAC)',
  'Tiền thuế GTGT',
  'TK thuế GTGT',
  'HH không TH trên tờ khai thuế GTGT',
  'Kho',
  'TK giá vốn',
  'TK Kho',
  'Đơn giá vốn',
  'Tiền vốn',
  'Hàng hóa giữ hộ/bán hộ',
] as const

// 0-based column indices we actually fill; everything else stays blank, matching
// the accountant's sample.
const COL = {
  paymentMethod: 2, // Phương thức thanh toán — 0 credit / 1 cash
  attachInvoice: 5, // Lập kèm hóa đơn — always 0
  postingDate: 7, // Ngày hạch toán (*)
  voucherDate: 8, // Ngày chứng từ (*)
  invoiceDate: 13, // Ngày hóa đơn
  customerCode: 14, // Mã khách hàng
  salesperson: 20, // NV bán hàng — plate digits (credit) / blank (cash)
  productCode: 21, // Mã hàng (*)
  productName: 22, // Tên hàng
  debitAccount: 24, // TK Tiền/Chi phí/Nợ (*)
  revenueAccount: 25, // TK Doanh thu/Có (*)
  quantity: 27, // Số lượng
  unitPrice: 29, // Đơn giá
  amount: 30, // Thành tiền
  warehouse: 43, // Kho
  costAccount: 44, // TK giá vốn
  stockAccount: 45, // TK Kho
} as const

export type StationConfig = {
  revenueAccount: string // 5111
  costAccount: string // 632
  stockAccount: string // 1561
  creditDebitAccount: string // 131
  cashDebitAccount: string // 11111
}

export type FuelMapEntry = {
  fuelType: string
  productCode: string // MISA "Mã hàng"
  productName: string // MISA "Tên hàng" (may be empty)
  warehouseCode: string // MISA "Kho"
}

export type RetailPrice = {
  fuelType: string
  effectiveDate: Date
  unitPrice: number
}

export type CreditCustomer = {
  id: string
  name: string
  misaCode: string | null
}

export type CreditVisit = {
  id: string
  customerId: string | null
  fuelType: string | null
  litersRead: number | null
  unitPriceRead: number | null
  computedAmount: number | null
  plate: string | null // confirmed plate, else AI-read plate
}

export type MisaBuildInput = {
  saleDate: Date
  // Accountant-set voucher dates written into H/I/N (uniform across all rows).
  // Each defaults to saleDate when the caller omits it.
  postingDate?: Date // Ngày hạch toán (*)
  voucherDate?: Date // Ngày chứng từ (*)
  invoiceDate?: Date // Ngày hóa đơn
  stationConfig: StationConfig | null
  fuelMap: FuelMapEntry[]
  prices: RetailPrice[]
  readings: SaleReading[]
  dispensers: SaleDispenser[]
  creditVisits: CreditVisit[]
  customers: CreditCustomer[]
}

export type MisaSalesRow = {
  kind: 'credit' | 'cash'
  paymentMethod: 0 | 1
  postingDate: string // dd/MM/yyyy — Ngày hạch toán (*)
  voucherDate: string // dd/MM/yyyy — Ngày chứng từ (*)
  invoiceDate: string // dd/MM/yyyy — Ngày hóa đơn
  customerCode: string
  salesperson: string // plate digits (credit) / '' (cash)
  productCode: string
  productName: string // Tên hàng
  debitAccount: string
  revenueAccount: string
  quantity: number
  unitPrice: number
  amount: number
  warehouse: string
  costAccount: string
  stockAccount: string
}

export type PreflightError = {
  code:
    | 'missing_global_config'
    | 'missing_fuel_map'
    | 'missing_price'
    | 'customer_without_misa_code'
    | 'visit_without_fuel_type'
  fuelType?: string
  customerId?: string
  visitId?: string
  message: string
}

export type PreflightWarning = {
  code: 'negative_cash_liters'
  fuelType: string
  meteredLiters: number
  creditLiters: number
  message: string
}

/** Per-fuel liter math shown to the accountant before export (metered / credit / cash). */
export type FuelSummary = {
  fuelType: string
  meteredLiters: number
  creditLiters: number
  cashLiters: number // metered − credit (may be negative → warning)
}

export type MisaBuildResult = {
  rows: MisaSalesRow[]
  errors: PreflightError[]
  warnings: PreflightWarning[]
  fuelSummary: FuelSummary[]
}

/** dd/MM/yyyy — the format all date columns carry. */
function formatDate(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${d.getUTCFullYear()}`
}

/** Plate digits for "NV bán hàng": the tail after the last '-' (e.g. 50E-75317 → 75317). */
function plateDigits(plate: string | null): string {
  if (!plate) return ''
  const tail = plate.split('-').pop() ?? plate
  return tail.trim()
}

/** Latest retail price with effectiveDate ≤ saleDate for a fuel, or null. */
function priceOnDate(prices: RetailPrice[], fuelType: string, saleDate: Date): number | null {
  let best: RetailPrice | null = null
  for (const p of prices) {
    if (p.fuelType !== fuelType) continue
    if (p.effectiveDate.getTime() > saleDate.getTime()) continue
    if (best === null || p.effectiveDate.getTime() > best.effectiveDate.getTime()) best = p
  }
  return best === null ? null : best.unitPrice
}

/**
 * Infer a fuel type from a pump-read unit price by matching it to the fuel whose
 * effective retail price on the sale date equals that price. Used to default a
 * credit visit's fuel type. Returns null when no (or an ambiguous) match exists.
 */
export function inferFuelTypeFromPrice(
  price: number,
  prices: RetailPrice[],
  saleDate?: Date
): string | null {
  const asOf = saleDate ?? new Date(8640000000000000) // no cutoff → any effective price
  const matches = new Set<string>()
  const fuels = new Set(prices.map((p) => p.fuelType))
  for (const fuelType of fuels) {
    if (priceOnDate(prices, fuelType, asOf) === price) matches.add(fuelType)
  }
  return matches.size === 1 ? ([...matches][0] ?? null) : null
}

/**
 * Build the MISA sales-voucher rows and preflight result for one station × one day.
 * Credit rows: one per credit visit (payment 0, debit 131). Cash rows: one per metered
 * fuel (payment 1, debit 11111), quantity = metered − credit liters. Rows are produced
 * best-effort for resolvable lines; unresolvable lines are skipped and recorded as errors.
 */
export function buildMisaSalesVoucher(input: MisaBuildInput): MisaBuildResult {
  const {
    saleDate,
    postingDate,
    voucherDate,
    invoiceDate,
    stationConfig,
    fuelMap,
    prices,
    readings,
    dispensers,
    creditVisits,
    customers,
  } = input
  const errors: PreflightError[] = []
  const warnings: PreflightWarning[] = []
  const rows: MisaSalesRow[] = []

  if (stationConfig === null) {
    errors.push({
      code: 'missing_global_config',
      message: 'No global MISA config (account codes).',
    })
    return { rows, errors, warnings, fuelSummary: [] }
  }

  const fuelMapByFuel = new Map(fuelMap.map((f) => [f.fuelType, f]))
  const customerById = new Map(customers.map((c) => [c.id, c]))
  // Voucher dates written into H/I/N — accountant-set, each defaulting to the sale date.
  const postingDateStr = formatDate(postingDate ?? saleDate)
  const voucherDateStr = formatDate(voucherDate ?? saleDate)
  const invoiceDateStr = formatDate(invoiceDate ?? saleDate)

  // Credit liters netted per fuel, accumulated while building credit rows.
  const creditLitersByFuel = new Map<string, number>()
  // Credit liters per resolved fuel for the preview math — counted for every visit
  // whose fuel type resolves, even one blocked by a missing customer/fuel-map, so
  // the accountant sees the real credit total while fixing the blocking error.
  const summaryCreditByFuel = new Map<string, number>()

  // --- Credit rows (bán nợ): one per credit visit ---
  for (const visit of creditVisits) {
    const fuelType =
      visit.fuelType ??
      (visit.unitPriceRead !== null
        ? inferFuelTypeFromPrice(visit.unitPriceRead, prices, saleDate)
        : null)
    if (fuelType === null) {
      errors.push({
        code: 'visit_without_fuel_type',
        visitId: visit.id,
        message: 'Credit visit has no fuel type and none could be inferred from its read price.',
      })
      continue
    }

    summaryCreditByFuel.set(
      fuelType,
      (summaryCreditByFuel.get(fuelType) ?? 0) + (visit.litersRead ?? 0)
    )

    const map = fuelMapByFuel.get(fuelType)
    if (map === undefined) {
      errors.push({
        code: 'missing_fuel_map',
        fuelType,
        message: `No MISA fuel-map entry for fuel "${fuelType}".`,
      })
      continue
    }

    const customer = visit.customerId !== null ? customerById.get(visit.customerId) : undefined
    if (customer === undefined || !customer.misaCode) {
      errors.push({
        code: 'customer_without_misa_code',
        customerId: visit.customerId ?? undefined,
        visitId: visit.id,
        message: 'Credit customer has no MISA code.',
      })
      continue
    }

    // Credit rows price from the config retail table (like cash rows), not the pump-read
    // price — the exported amount reflects the standard retail price on the sale date.
    const price = priceOnDate(prices, fuelType, saleDate)
    if (price === null) {
      errors.push({
        code: 'missing_price',
        fuelType,
        message: `No configured retail price for fuel "${fuelType}" on the sale date.`,
      })
      continue
    }

    const liters = visit.litersRead ?? 0
    creditLitersByFuel.set(fuelType, (creditLitersByFuel.get(fuelType) ?? 0) + liters)

    rows.push({
      kind: 'credit',
      paymentMethod: 0,
      postingDate: postingDateStr,
      voucherDate: voucherDateStr,
      invoiceDate: invoiceDateStr,
      customerCode: customer.misaCode,
      salesperson: plateDigits(visit.plate),
      productCode: map.productCode,
      productName: map.productName,
      debitAccount: stationConfig.creditDebitAccount,
      revenueAccount: stationConfig.revenueAccount,
      quantity: liters,
      unitPrice: price,
      amount: Math.round(liters * price),
      warehouse: map.warehouseCode,
      costAccount: stationConfig.costAccount,
      stockAccount: stationConfig.stockAccount,
    })
  }

  // --- Cash rows (bán lẻ): one per metered fuel ---
  const { sales } = computeShiftSales(readings, dispensers)
  for (const sale of sales) {
    const fuelType = sale.fuelType
    const map = fuelMapByFuel.get(fuelType)
    if (map === undefined) {
      errors.push({
        code: 'missing_fuel_map',
        fuelType,
        message: `No MISA fuel-map entry for fuel "${fuelType}".`,
      })
      continue
    }

    const price = priceOnDate(prices, fuelType, saleDate)
    if (price === null) {
      errors.push({
        code: 'missing_price',
        fuelType,
        message: `No configured retail price for fuel "${fuelType}" on the sale date.`,
      })
      continue
    }

    const creditLiters = creditLitersByFuel.get(fuelType) ?? 0
    const quantity = round3(sale.liters - creditLiters)
    if (quantity < 0) {
      warnings.push({
        code: 'negative_cash_liters',
        fuelType,
        meteredLiters: round3(sale.liters),
        creditLiters: round3(creditLiters),
        message: `Cash liters for fuel "${fuelType}" are negative (credit exceeds metered).`,
      })
    }

    rows.push({
      kind: 'cash',
      paymentMethod: 1,
      postingDate: postingDateStr,
      voucherDate: voucherDateStr,
      invoiceDate: invoiceDateStr,
      customerCode: 'bl',
      salesperson: '',
      productCode: map.productCode,
      productName: map.productName,
      debitAccount: stationConfig.cashDebitAccount,
      revenueAccount: stationConfig.revenueAccount,
      quantity,
      unitPrice: price,
      amount: Math.round(quantity * price),
      warehouse: map.warehouseCode,
      costAccount: stationConfig.costAccount,
      stockAccount: stationConfig.stockAccount,
    })
  }

  // Per-fuel preview math over the union of metered and credit fuels.
  const meteredByFuel = new Map(sales.map((s) => [s.fuelType, s.liters]))
  const fuelSummary: FuelSummary[] = [
    ...new Set([...meteredByFuel.keys(), ...summaryCreditByFuel.keys()]),
  ].map((fuelType) => {
    const meteredLiters = round3(meteredByFuel.get(fuelType) ?? 0)
    const creditLiters = round3(summaryCreditByFuel.get(fuelType) ?? 0)
    return {
      fuelType,
      meteredLiters,
      creditLiters,
      cashLiters: round3(meteredLiters - creditLiters),
    }
  })

  return { rows, errors, warnings, fuelSummary }
}

/**
 * Present the structured rows as a 49-column matrix: [header, ...cells]. Pure, no Excel —
 * the export route (next slice) wraps this with XLSX.utils.aoa_to_sheet + bookType 'xlsx'.
 */
export function misaRowsToMatrix(rows: MisaSalesRow[]): (string | number | null)[][] {
  const header = [...MISA_SALES_COLUMNS]
  const body = rows.map((r) => {
    const cells: (string | number | null)[] = new Array(MISA_SALES_COLUMNS.length).fill(null)
    cells[COL.paymentMethod] = r.paymentMethod
    cells[COL.attachInvoice] = 0
    cells[COL.postingDate] = r.postingDate
    cells[COL.voucherDate] = r.voucherDate
    cells[COL.invoiceDate] = r.invoiceDate
    cells[COL.customerCode] = r.customerCode
    cells[COL.salesperson] = r.salesperson || null
    cells[COL.productCode] = r.productCode
    cells[COL.productName] = r.productName || null
    cells[COL.debitAccount] = r.debitAccount
    cells[COL.revenueAccount] = r.revenueAccount
    cells[COL.quantity] = r.quantity
    cells[COL.unitPrice] = r.unitPrice
    cells[COL.amount] = r.amount
    cells[COL.warehouse] = r.warehouse
    cells[COL.costAccount] = r.costAccount
    cells[COL.stockAccount] = r.stockAccount
    return cells
  })
  return [header, ...body]
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
