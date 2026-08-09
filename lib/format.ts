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
