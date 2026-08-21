import { describe, expect, it } from 'vitest'

import {
  type ShiftStatus,
  canCreateReading,
  canEditClosing,
  canEditOpening,
  canReviewShift,
  isReadingDecided,
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

describe('canCreateReading', () => {
  // Entering a Trụ no photo arrived for follows the closing rule, pinned here
  // against concrete booleans rather than against canEditClosing.
  it('lets the admin create a reading at any status', () => {
    for (const status of [...PRE_COMPLETED, 'completed' as ShiftStatus]) {
      expect(canCreateReading('admin', status)).toBe(true)
    }
  })

  it('lets the accountant create a reading until the ca is completed', () => {
    for (const status of PRE_COMPLETED) {
      expect(canCreateReading('accountant', status)).toBe(true)
    }
    expect(canCreateReading('accountant', 'completed')).toBe(false)
  })

  it('never lets a viewer create a reading', () => {
    for (const status of [...PRE_COMPLETED, 'completed' as ShiftStatus]) {
      expect(canCreateReading('viewer', status)).toBe(false)
    }
  })
})

describe('isReadingDecided', () => {
  // Duyệt / Từ chối freeze the row's values for every role — including the admin,
  // who keeps only the button that reverses the call.
  it('treats a duyệt or từ chối row as decided', () => {
    expect(isReadingDecided('approved')).toBe(true)
    expect(isReadingDecided('rejected')).toBe(true)
  })

  // Tự duyệt is the AI's own high-confidence pass, not a human call, so it leaves
  // the row editable — repairing an AI misread before chốt is the daily work.
  it('leaves every undecided status editable', () => {
    expect(isReadingDecided('auto_approved')).toBe(false)
    expect(isReadingDecided('pending')).toBe(false)
    expect(isReadingDecided('needs_review')).toBe(false)
    expect(isReadingDecided('corrected')).toBe(false)
    expect(isReadingDecided(null)).toBe(false)
  })
})
