import { describe, expect, it } from 'vitest'

import { daysUntil, documentStatus, dueReminderThreshold } from '@/lib/documents/expiry-checker'

const now = new Date('2026-06-17T00:00:00.000Z')
function inDays(n: number): Date {
  return new Date(now.getTime() + n * 24 * 60 * 60 * 1000)
}

describe('daysUntil', () => {
  it('counts whole days, negative when past', () => {
    expect(daysUntil(inDays(30), now)).toBe(30)
    expect(daysUntil(inDays(-5), now)).toBe(-5)
  })
})

describe('documentStatus', () => {
  it('classifies valid / expiring_soon / expired', () => {
    expect(documentStatus(inDays(120), now)).toBe('valid')
    expect(documentStatus(inDays(45), now)).toBe('expiring_soon')
    expect(documentStatus(inDays(-1), now)).toBe('expired')
    expect(documentStatus(null, now)).toBe('valid')
  })
})

describe('dueReminderThreshold', () => {
  it('returns the threshold the expiry lands on today', () => {
    expect(dueReminderThreshold(inDays(60), now)).toBe(60)
    expect(dueReminderThreshold(inDays(30), now)).toBe(30)
    expect(dueReminderThreshold(inDays(15), now)).toBe(15)
    expect(dueReminderThreshold(inDays(31), now)).toBeNull()
  })
})
