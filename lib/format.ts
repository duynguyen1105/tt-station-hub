import dayjs from 'dayjs'
import 'dayjs/locale/vi'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

dayjs.extend(customParseFormat)
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.locale('vi')

// All dates in the app are Vietnam wall-clock times. Server components render
// on Vercel in UTC, so formatting without pinning the zone shifted every
// datetime by -7h (an import at 01/08 06:54 displayed as 31/07).
const VN_TZ = 'Asia/Ho_Chi_Minh'

/** A dayjs instance pinned to Vietnam time — use for any custom display format. */
export function vnTime(value: Date | string | number): dayjs.Dayjs {
  return dayjs(value).tz(VN_TZ)
}

type Numeric = number | string | null | undefined

function toNumber(value: Numeric): number | null {
  if (value === null || value === undefined || value === '') return null
  const num = typeof value === 'string' ? Number(value) : value
  return Number.isNaN(num) ? null : num
}

/**
 * Money in VND, grouped with commas, no decimals, đ suffix: 1234567 -> "1,234,567 đ".
 * Display only; never use a formatted string for arithmetic.
 */
export function formatVND(value: Numeric): string {
  const num = toNumber(value)
  if (num === null) return '0 đ'
  return `${Math.round(num).toLocaleString('en-US')} đ`
}

/**
 * A typed VND amount regrouped as the user types: "36992230" -> "36,992,230".
 * Non-digits are dropped; an input with no digits stays empty.
 */
export function groupThousands(value: string): string {
  return value
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '')
    .replace(/\B(?=(\d{3})+$)/g, ',')
}

/**
 * The plain amount behind a grouped money field: "1,234,500 đ" -> "1234500".
 * A leading minus survives only when the field allows negatives (a khách trả trước).
 */
export function moneyDigits(value: string, allowNegative = false): string {
  const negative = allowNegative && value.trim().startsWith('-')
  const digits = value.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  return negative ? `-${digits}` : digits
}

/**
 * A plain amount grouped for a money field: "-1234500" -> "-1,234,500".
 * A lone "-" stays so the user can go on typing a negative amount.
 */
export function groupMoney(value: string): string {
  const grouped = groupThousands(value)
  return value.trim().startsWith('-') ? `-${grouped}` : grouped
}

/**
 * Where the caret sits in `display` once `count` digits (or minus) lie before it —
 * keeps the caret in place while a money field regroups under the user's typing.
 */
export function caretAfterDigits(display: string, count: number): number {
  if (count <= 0) return 0
  let seen = 0
  for (let i = 0; i < display.length; i++) {
    if (/[\d-]/.test(display.charAt(i)) && ++seen === count) return i + 1
  }
  return display.length
}

/**
 * Liters with comma thousands and a fixed number of decimals (default 2):
 * 1234.5 -> "1,234.50". Debt cards pass 3 to mirror the pump's LÍT row.
 */
export function formatLiters(value: Numeric, decimals = 2): string {
  const num = toNumber(value)
  if (num === null) return (0).toFixed(decimals)
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/**
 * Date + time as dd/MM/yyyy HH:mm (e.g. "17/06/2026 08:05").
 */
export function formatDateTime(value: Date | string | number | null | undefined): string {
  if (!value) return ''
  const d = vnTime(value)
  return d.isValid() ? d.format('DD/MM/YYYY HH:mm') : ''
}

/**
 * Date as dd/MM/yyyy (e.g. "17/06/2026").
 */
export function formatDate(value: Date | string | number | null | undefined): string {
  if (!value) return ''
  const d = vnTime(value)
  return d.isValid() ? d.format('DD/MM/YYYY') : ''
}
