import { describe, expect, it } from 'vitest'

import { chainCashBalances } from '@/lib/shifts/cash-balance'

describe('chainCashBalances', () => {
  it('sums the phiếu chốt ca: đầu ngày + bán + thu − chi − nợ', () => {
    // Anh Nam's 27/09 phiếu for DAKNONG1.
    const lines = chainCashBalances(3_000_000, [
      { shiftId: 'a', sales: 62_882_510, receipts: 0, payments: 33_000, debts: 45_659_800 },
    ])
    expect(lines.get('a')).toEqual({
      opening: 3_000_000,
      sales: 62_882_510,
      receipts: 0,
      payments: 33_000,
      debts: 45_659_800,
      closing: 20_189_710,
    })
  })

  it("opens each ca at the previous ca's tồn cuối ngày", () => {
    const lines = chainCashBalances(1_000, [
      { shiftId: 'a', sales: 500, receipts: 100, payments: 50, debts: 200 },
      { shiftId: 'b', sales: 0, receipts: 0, payments: 0, debts: 0 },
      { shiftId: 'c', sales: 10, receipts: 0, payments: 2_000, debts: 0 },
    ])
    expect(lines.get('a')?.closing).toBe(1_350)
    expect(lines.get('b')).toMatchObject({ opening: 1_350, closing: 1_350 })
    // A tồn below zero is kept, not clamped — the phiếu must show the shortfall.
    expect(lines.get('c')).toMatchObject({ opening: 1_350, closing: -640 })
  })

  it('rounds litre × giá dust to whole đồng before chaining', () => {
    const lines = chainCashBalances(0, [
      { shiftId: 'a', sales: 100.4999, receipts: 0, payments: 0, debts: 0.6 },
    ])
    expect(lines.get('a')).toMatchObject({ sales: 100, debts: 1, closing: 99 })
  })
})
