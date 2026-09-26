import { describe, expect, it } from 'vitest'

import { chargeAmountOf, nextAmountFields } from '@/lib/debts/visit-amount'
import { canEditDebtVisit, debtVisitDecision } from '@/lib/debts/visit-review'

describe('decided debt visits', () => {
  it('lets only admin edit approved or rejected visits', () => {
    for (const status of ['approved', 'rejected']) {
      expect(canEditDebtVisit('admin', status)).toBe(true)
      expect(canEditDebtVisit('accountant', status)).toBe(false)
      expect(canEditDebtVisit('viewer', status)).toBe(false)
    }
    expect(canEditDebtVisit('accountant', 'needs_review')).toBe(true)
    expect(canEditDebtVisit('accountant', 'corrected')).toBe(true)
    expect(canEditDebtVisit('viewer', 'pending')).toBe(false)
  })

  it('corrects an approved charge in place, preserving its verdict', () => {
    const amounts = nextAmountFields(
      {
        litersRead: 38,
        unitPriceRead: 26_000,
        amountOverride: null,
        originalLitersRead: null,
        originalUnitPriceRead: null,
      },
      { litersRead: 40, unitPriceRead: 25_000 }
    )
    expect(debtVisitDecision('approved', 'correct')).toEqual({
      reviewStatus: 'approved',
      charge: 'update',
    })
    expect(chargeAmountOf(amounts)).toBe(1_000_000)
    expect(amounts.originalLitersRead).toBe(38)
    expect(amounts.originalUnitPriceRead).toBe(26_000)
  })

  it('removes an approved charge, and posts once when a rejected visit is approved', () => {
    expect(debtVisitDecision('approved', 'reject')).toEqual({
      reviewStatus: 'rejected',
      charge: 'delete',
    })
    expect(debtVisitDecision('rejected', 'correct')).toEqual({
      reviewStatus: 'rejected',
      charge: 'none',
    })
    expect(debtVisitDecision('rejected', 'approve')).toEqual({
      reviewStatus: 'approved',
      charge: 'create',
    })
    expect(debtVisitDecision('needs_review', 'correct')).toEqual({
      reviewStatus: 'corrected',
      charge: 'none',
    })
    expect(debtVisitDecision('approved', 'approve')).toBeNull()
  })
})
