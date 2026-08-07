// Shared shapes + parsing helpers for the BIÊN BẢN GIAO NHẬN XĂNG DẦU flow:
// the AI extraction, the review form, and the receipt API all speak these
// types. Numbers on the paper form use Vietnamese separators ("6.000" liters,
// "34,5" °C, "141.008,78") and the AI occasionally echoes them verbatim, so
// every numeric field funnels through parseVnNumber.

export type ReceiptProduct = {
  productLabel: string
  warehouse: string | null
  quantityLiters: number | null
  exportSlipNo: string | null
  sealNo: string | null
}

export type ReceiptCompartment = {
  compartmentNo: number
  liters: number | null
  valvePosition: string | null
  compensationLiters: number | null
  temperatureC: number | null
}

export type TankSideCheck = {
  temperatureC: number | null
  heightMm: number | null
  bookLiters: number | null
  baremLiters: number | null
}

export type ReceiptTankCheck = {
  tankLabel: string
  before: TankSideCheck
  after: TankSideCheck
}

export type PumpSideCheck = {
  electronic: number | null
  mechanical: number | null
}

export type ReceiptPumpCheck = {
  pumpLabel: string | null
  before: PumpSideCheck
  after: PumpSideCheck
}

export type BienBanExtraction = {
  stationName: string | null
  receiptDate: string | null // YYYY-MM-DD when legible
  staffName: string | null
  driverName: string | null
  truckPlate: string | null
  vehicleCheck: string | null
  note: string | null
  products: ReceiptProduct[]
  compartments: ReceiptCompartment[]
  tanks: ReceiptTankCheck[]
  pumps: ReceiptPumpCheck[]
  confidence: number
}

/**
 * Parses a number that may carry Vietnamese (or US) separators. A single
 * separator followed by exactly 3 digits is a thousands group ("6.000" →
 * 6000, "109,622" → 109622); 1-2 trailing digits mean a decimal ("34,5",
 * "141008,78"). When both separators appear, the last one is the decimal
 * point ("141.008,78" → 141008.78).
 */
export function parseVnNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const raw = value.replace(/\s|°|c$/gi, '').trim()
  if (raw === '') return null
  const sign = raw.startsWith('-') ? -1 : 1
  const digits = raw.replace(/^[+-]/, '')
  if (!/^[\d.,]+$/.test(digits)) return null

  const lastDot = digits.lastIndexOf('.')
  const lastComma = digits.lastIndexOf(',')
  let normalized: string
  if (lastDot >= 0 && lastComma >= 0) {
    // Both present: the later one is the decimal separator, the other groups thousands.
    const decimalSep = lastDot > lastComma ? '.' : ','
    const thousandsSep = decimalSep === '.' ? ',' : '.'
    normalized = digits.split(thousandsSep).join('').replace(decimalSep, '.')
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ','
    const parts = digits.split(sep)
    const groupsOf3 = parts.slice(1).every((p) => p.length === 3)
    // "6.000" / "1.037.500" are thousand groups; "34,5" / "82118,87" are decimals.
    normalized =
      parts.length > 1 && groupsOf3
        ? parts.join('')
        : `${parts.slice(0, -1).join('')}.${parts.at(-1)}`
  } else {
    normalized = digits
  }
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? sign * parsed : null
}

/**
 * Normalizes a paper tank label ("HẦM 2 12K", "HẦM 1 XA", "Hầm 03") to the
 * canonical tank code "HAM_2" (+ capacity when the label carries it).
 */
export function tankCodeFromLabel(
  label: string
): { code: string; capacityK: number | null } | null {
  const match = label.toUpperCase().match(/H[ẦẤÂA]M\s*0*(\d+)/u)
  if (!match) return null
  const capacity = label.toUpperCase().match(/(\d+)\s*K\b/u)
  return { code: `HAM_${match[1]}`, capacityK: capacity ? Number(capacity[1]) : null }
}

export function emptyTankSide(): TankSideCheck {
  return { temperatureC: null, heightMm: null, bookLiters: null, baremLiters: null }
}

export function emptyExtraction(): BienBanExtraction {
  return {
    stationName: null,
    receiptDate: null,
    staffName: null,
    driverName: null,
    truckPlate: null,
    vehicleCheck: null,
    note: null,
    products: [],
    compartments: [],
    tanks: [],
    pumps: [],
    confidence: 0,
  }
}
