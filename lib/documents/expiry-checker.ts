// Legal-document expiry logic (build plan §3.1).

export type DocStatus = 'valid' | 'expiring_soon' | 'expired'

const DAY_MS = 24 * 60 * 60 * 1000

export const EXPIRING_SOON_DAYS = 60
// Reminders fire as the expiry crosses each of these day-marks.
export const REMINDER_THRESHOLDS = [60, 30, 15] as const

const VN_OFFSET_MS = 7 * 60 * 60 * 1000

/**
 * Whole calendar days from today (GMT+7) until the expiry day (negative once past).
 * A giấy tờ is valid through the whole day printed on it: the expiry is a date-only
 * value (UTC midnight), so it is compared day to day, never against the clock.
 */
export function daysUntil(expiry: Date, now: Date): number {
  const vn = new Date(now.getTime() + VN_OFFSET_MS)
  const today = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate())
  const day = Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate())
  return Math.round((day - today) / DAY_MS)
}

export function documentStatus(expiry: Date | null, now: Date): DocStatus {
  if (!expiry) return 'valid'
  const days = daysUntil(expiry, now)
  if (days < 0) return 'expired'
  if (days <= EXPIRING_SOON_DAYS) return 'expiring_soon'
  return 'valid'
}

/**
 * Returns the reminder threshold (60/30/15) that `expiry` lands on exactly
 * today, or null. Intended to run from a daily cron.
 */
export function dueReminderThreshold(expiry: Date | null, now: Date): number | null {
  if (!expiry) return null
  const days = daysUntil(expiry, now)
  return REMINDER_THRESHOLDS.find((threshold) => threshold === days) ?? null
}
