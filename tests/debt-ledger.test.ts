import { describe, expect, it } from 'vitest'

import { type LedgerTx, balanceOf, debtDay } from '@/lib/debts/ledger'

const anchor = { openingBalance: 1_000_000, openingDate: '2026-09-14' }
const txs: LedgerTx[] = [
  { txType: 'charge', amount: 500_000, txDate: '2026-09-13' },
  { txType: 'charge', amount: 300_000, txDate: '2026-09-18' },
  { txType: 'payment', amount: 200_000, txDate: '2026-09-18' },
]

describe('debtDay', () => {
  it('does not reach back before the opening date', () => {
    expect(debtDay(anchor, txs, '2026-09-13')).toBeNull()
  })

  it('opens at nợ đầu kỳ on the opening date', () => {
    expect(debtDay(anchor, txs, '2026-09-14')).toEqual({
      opening: 1_000_000,
      charged: 0,
      chargeCount: 0,
      paid: 0,
      closing: 1_000_000,
    })
  })

  it('adds the day charges and subtracts the day payments', () => {
    expect(debtDay(anchor, txs, '2026-09-18')).toEqual({
      opening: 1_000_000,
      charged: 300_000,
      chargeCount: 1,
      paid: 200_000,
      closing: 1_100_000,
    })
  })

  it("carries a day's closing into the next day's opening", () => {
    expect(debtDay(anchor, txs, '2026-09-19')?.opening).toBe(
      debtDay(anchor, txs, '2026-09-18')?.closing
    )
  })
})

describe('balanceOf', () => {
  it('ignores transactions already inside nợ đầu kỳ', () => {
    expect(balanceOf(anchor, txs)).toBe(1_100_000)
  })

  it('counts every transaction without an anchor', () => {
    const none = { openingBalance: 0, openingDate: null }
    expect(balanceOf(none, txs)).toBe(600_000)
    expect(debtDay(none, txs, '2026-09-13')?.charged).toBe(500_000)
  })
})
