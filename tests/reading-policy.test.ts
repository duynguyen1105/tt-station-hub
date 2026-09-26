import { describe, expect, it } from 'vitest'

import {
  type ShiftStatus,
  canCreateReading,
  canEditAirPurge,
  canEditCashEntries,
  canEditClosing,
  canEditOpening,
  canReviewShift,
  isReadingDecided,
  isReadingFrozen,
  reviewStatusAfterEdit,
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
  // Debt opening balances use the same admin-only predicate without a shift.
  it('lets only the admin edit an opening', () => {
    expect(canEditOpening('admin')).toBe(true)
    expect(canEditOpening('accountant')).toBe(false)
    expect(canEditOpening('viewer')).toBe(false)
  })
})

describe('canEditClosing', () => {
  it('lets admin edit until the ca is completed, never after', () => {
    for (const status of PRE_COMPLETED) expect(canEditClosing('admin', status)).toBe(true)
    expect(canEditClosing('admin', 'completed')).toBe(false)
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
  it('lets admin review until the ca is completed, never after', () => {
    for (const status of PRE_COMPLETED) expect(canReviewShift('admin', status)).toBe(true)
    expect(canReviewShift('admin', 'completed')).toBe(false)
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
  it('lets admin create a reading until the ca is completed, never after', () => {
    for (const status of PRE_COMPLETED) expect(canCreateReading('admin', status)).toBe(true)
    expect(canCreateReading('admin', 'completed')).toBe(false)
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
  // Decision state is independent of whether admin may correct the row.
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

describe('isReadingFrozen', () => {
  it('freezes decided rows for accountant and viewer, but not admin', () => {
    for (const decision of ['approved', 'rejected']) {
      expect(isReadingFrozen('admin', decision)).toBe(false)
      expect(isReadingFrozen('accountant', decision)).toBe(true)
      expect(isReadingFrozen('viewer', decision)).toBe(true)
    }
    expect(isReadingFrozen('accountant', 'auto_approved')).toBe(false)
  })
})

describe('reviewStatusAfterEdit', () => {
  it('keeps a human decision while recomputing an edited row, but updates undecided rows', () => {
    expect(reviewStatusAfterEdit('approved', 'needs_review')).toBe('approved')
    expect(reviewStatusAfterEdit('rejected', 'auto_approved')).toBe('rejected')
    expect(reviewStatusAfterEdit('pending', 'corrected')).toBe('corrected')
  })
})

describe('canEditAirPurge', () => {
  // An air purge mirrors the closing rule — it moves the same money a closing
  // correction does — so the role × status matrix is pinned against concrete
  // booleans here rather than compared to canEditClosing.
  it('lets admin purge until the ca is chốt, never after', () => {
    for (const status of PRE_COMPLETED) expect(canEditAirPurge('admin', status)).toBe(true)
    expect(canEditAirPurge('admin', 'completed')).toBe(false)
  })

  it('lets the accountant record an air purge until the ca is chốt', () => {
    for (const status of PRE_COMPLETED) {
      expect(canEditAirPurge('accountant', status)).toBe(true)
    }
    expect(canEditAirPurge('accountant', 'completed')).toBe(false)
  })

  it('never lets a viewer record an air purge', () => {
    for (const status of [...PRE_COMPLETED, 'completed' as ShiftStatus]) {
      expect(canEditAirPurge('viewer', status)).toBe(false)
    }
  })

  it('does not freeze purge on a decided row, but still locks a completed ca', () => {
    expect(isReadingDecided('approved')).toBe(true)
    expect(canEditAirPurge('accountant', 'pending_review')).toBe(true)
    expect(canEditAirPurge('admin', 'pending_review')).toBe(true)
    expect(canEditAirPurge('admin', 'completed')).toBe(false)
  })
})

describe('canEditCashEntries', () => {
  // Thu chi tiền mặt is a note nothing on the ca is derived from, so chốt does not lock it.
  it('lets the admin and the accountant edit it at any status, the viewer never', () => {
    expect(canEditCashEntries('admin')).toBe(true)
    expect(canEditCashEntries('accountant')).toBe(true)
    expect(canEditCashEntries('viewer')).toBe(false)
  })
})
