import { describe, expect, it } from 'vitest'

import {
  type ShiftStatus,
  canEditClosing,
  canEditOpening,
  canReviewShift,
} from '@/lib/auth/reading-policy'

// A representative pre-completed status and the one status that locks the ca.
// `cancelled` deliberately follows the pre-completed rule, so it is grouped with
// `pending_review` here rather than with `completed`.
const PRE_COMPLETED: ShiftStatus[] = [
  'open',
  'collecting_photos',
  'ai_processing',
  'pending_review',
  'cancelled',
]

describe('canEditOpening', () => {
  // Opening = admin-only, at any shift status.
  it('lets only the admin edit an opening', () => {
    expect(canEditOpening('admin')).toBe(true)
    expect(canEditOpening('accountant')).toBe(false)
    expect(canEditOpening('viewer')).toBe(false)
  })
})

describe('canEditClosing', () => {
  it('lets the admin edit a closing at any status', () => {
    for (const status of [...PRE_COMPLETED, 'completed' as ShiftStatus]) {
      expect(canEditClosing('admin', status)).toBe(true)
    }
  })

  it('lets the accountant edit a closing until the ca is completed', () => {
    for (const status of PRE_COMPLETED) {
      expect(canEditClosing('accountant', status)).toBe(true)
    }
    expect(canEditClosing('accountant', 'completed')).toBe(false)
  })

  it('never lets a viewer edit a closing', () => {
    for (const status of [...PRE_COMPLETED, 'completed' as ShiftStatus]) {
      expect(canEditClosing('viewer', status)).toBe(false)
    }
  })
})

describe('canReviewShift', () => {
  // Reviewing (approve / reject / chốt) follows the same rule as editing a
  // closing. Every review cell is asserted against a concrete expected boolean
  // rather than compared to canEditClosing, so the rule is pinned independently.
  it('lets the admin review at any status', () => {
    for (const status of [...PRE_COMPLETED, 'completed' as ShiftStatus]) {
      expect(canReviewShift('admin', status)).toBe(true)
    }
  })

  it('lets the accountant review until the ca is completed', () => {
    for (const status of PRE_COMPLETED) {
      expect(canReviewShift('accountant', status)).toBe(true)
    }
    expect(canReviewShift('accountant', 'completed')).toBe(false)
  })

  it('never lets a viewer review', () => {
    for (const status of [...PRE_COMPLETED, 'completed' as ShiftStatus]) {
      expect(canReviewShift('viewer', status)).toBe(false)
    }
  })
})
