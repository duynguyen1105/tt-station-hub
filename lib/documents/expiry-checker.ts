// Legal-document expiry logic (build plan §3.1).

export type DocStatus = 'valid' | 'expiring_soon' | 'expired'

const DAY_MS = 24 * 60 * 60 * 1000

export const EXPIRING_SOON_DAYS = 60
// Reminders fire as the expiry crosses each of these day-marks.
export const REMINDER_THRESHOLDS = [60, 30, 15] as const

/** Whole days from `now` until `expiry` (negative if already past). */
export function daysUntil(expiry: Date, now: Date): number {
  return Math.floor((expiry.getTime() - now.getTime()) / DAY_MS)
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
