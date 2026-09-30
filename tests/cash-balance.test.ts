import { describe, expect, it } from 'vitest'

import { chainCashBalances } from '@/lib/shifts/cash-balance'

const day = { transfers: 0, receipts: 0, payments: 0, debts: 0 }

describe('chainCashBalances', () => {
  it('sums the phiếu chốt ca: đầu ngày + bán + thu − chi − nợ', () => {
    // Anh Nam's 27/09 phiếu for DAKNONG1.
    const lines = chainCashBalances(3_000_000, [
      { ...day, shiftId: 'a', sales: 62_882_510, payments: 33_000, debts: 45_659_800 },
    ])
    expect(lines.get('a')).toEqual({
      opening: 3_000_000,
      sales: 62_882_510,
      transfers: 0,
      receipts: 0,
      payments: 33_000,
      debts: 45_659_800,
      closing: 20_189_710,
    })
  })

  // PHUCTIEN 28/09: khách đổ xăng dầu ck cty — sold in the ca, paid into the bank.
  it('takes the chuyển khoản trong ca off the két, apart from Tổng chi', () => {
    const lines = chainCashBalances(1_000_000, [
      { ...day, shiftId: 'a', sales: 20_000_000, transfers: 8_428_800, payments: 20_000 },
    ])
    expect(lines.get('a')).toMatchObject({
      transfers: 8_428_800,
      payments: 20_000,
      closing: 12_551_200,
    })
  })

  it("opens each ca at the previous ca's tồn cuối ngày", () => {
    const lines = chainCashBalances(1_000, [
      { ...day, shiftId: 'a', sales: 500, receipts: 100, payments: 50, debts: 200 },
      { ...day, shiftId: 'b', sales: 0 },
      { ...day, shiftId: 'c', sales: 10, payments: 2_000 },
    ])
    expect(lines.get('a')?.closing).toBe(1_350)
    expect(lines.get('b')).toMatchObject({ opening: 1_350, closing: 1_350 })
    // A tồn below zero is kept, not clamped — the phiếu must show the shortfall.
    expect(lines.get('c')).toMatchObject({ opening: 1_350, closing: -640 })
  })

  it('rounds litre × giá dust to whole đồng before chaining', () => {
    const lines = chainCashBalances(0, [{ ...day, shiftId: 'a', sales: 100.4999, debts: 0.6 }])
    expect(lines.get('a')).toMatchObject({ sales: 100, debts: 1, closing: 99 })
  })
})
