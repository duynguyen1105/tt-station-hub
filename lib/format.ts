import dayjs from 'dayjs'
import 'dayjs/locale/vi'
import customParseFormat from 'dayjs/plugin/customParseFormat'

dayjs.extend(customParseFormat)
dayjs.locale('vi')

type Numeric = number | string | null | undefined

function toNumber(value: Numeric): number | null {
  if (value === null || value === undefined || value === '') return null
  const num = typeof value === 'string' ? Number(value) : value
  return Number.isNaN(num) ? null : num
}

/**
 * Money in VND, grouped with commas and no decimals: 1234567 -> "1,234,567".
 * Display only; never use a formatted string for arithmetic.
 */
export function formatVND(value: Numeric): string {
  const num = toNumber(value)
  if (num === null) return '0'
  return Math.round(num).toLocaleString('en-US')
}

/**
 * Liters with comma thousands and exactly 2 decimals: 1234.5 -> "1,234.50".
 */
export function formatLiters(value: Numeric): string {
  const num = toNumber(value)
  if (num === null) return '0.00'
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Date + time as dd/MM/yyyy HH:mm (e.g. "17/06/2026 08:05").
 */
export function formatDateTime(value: Date | string | number | null | undefined): string {
  if (!value) return ''
  const d = dayjs(value)
  return d.isValid() ? d.format('DD/MM/YYYY HH:mm') : ''
}

/**
 * Date as dd/MM/yyyy (e.g. "17/06/2026").
 */
export function formatDate(value: Date | string | number | null | undefined): string {
  if (!value) return ''
  const d = dayjs(value)
  return d.isValid() ? d.format('DD/MM/YYYY') : ''
}
