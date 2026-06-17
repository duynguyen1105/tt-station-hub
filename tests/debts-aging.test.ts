import { describe, expect, it } from 'vitest'

import { agingBuckets, allocatePayment, computeBalance } from '@/lib/debts/aging'

const now = new Date('2026-06-17T00:00:00.000Z')
function daysAgo(n: number): Date {
  return new Date(now.getTime() - n * 24 * 60 * 60 * 1000)
}

describe('computeBalance', () => {
  it('adds charges and subtracts payments', () => {
    expect(
      computeBalance(0, [
        { txType: 'charge', amount: 1000 },
        { txType: 'charge', amount: 500 },
        { txType: 'payment', amount: 400 },
      ])
    ).toBe(1100)
  })
})

describe('agingBuckets', () => {
  it('buckets charges by age', () => {
    const buckets = agingBuckets(
      [
        { amount: 100, date: daysAgo(10) },
        { amount: 200, date: daysAgo(45) },
        { amount: 300, date: daysAgo(75) },
        { amount: 400, date: daysAgo(120) },
      ],
      now
    )
    expect(buckets).toEqual({ current: 100, d31_60: 200, d61_90: 300, over90: 400 })
  })
})

describe('allocatePayment', () => {
  it('applies a payment to the oldest charges first', () => {
    const allocations = allocatePayment(250, [
      { id: 'c2', remaining: 200, date: daysAgo(10) },
      { id: 'c1', remaining: 100, date: daysAgo(40) },
    ])
    expect(allocations).toEqual([
      { chargeId: 'c1', applied: 100 },
      { chargeId: 'c2', applied: 150 },
    ])
  })
})
