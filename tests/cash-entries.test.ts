import { describe, expect, it } from 'vitest'

import {
  type CashEntryInput,
  cashEntryTotals,
  debtChargesOf,
  debtPaymentsOf,
  inShiftTransferOf,
  isBlankCashEntry,
  normalizeCashEntries,
  refuseCashEntries,
} from '@/lib/shifts/cash-entries'
import { vi } from '@/messages/vi'

function row(overrides: Partial<CashEntryInput> = {}): CashEntryInput {
  return {
    content: '',
    customerId: null,
    counterparty: '',
    receipt: '',
    payment: '',
    chargesDebt: false,
    transfer: '',
    repaysDebt: false,
    ...overrides,
  }
}

// The kế toán's Excel sheet this table replaces.
const sheet = [
  row({ content: 'Phí chuyển khoản', payment: '33.122' }),
  row({ content: 'Nộp tiền', counterparty: 'Vietcombank', payment: '20.355.520' }),
  row(),
]

describe('isBlankCashEntry', () => {
  it('treats a row of whitespace as blank', () => {
    expect(isBlankCashEntry(row({ content: '  ', receipt: ' ' }))).toBe(true)
  })

  it('treats any typed cell as not blank', () => {
    expect(isBlankCashEntry(row({ counterparty: 'Anh Ba' }))).toBe(false)
    expect(isBlankCashEntry(row({ transfer: '100.000' }))).toBe(false)
  })

  it('treats a picked khách hàng alone as not blank', () => {
    expect(isBlankCashEntry(row({ customerId: 'c-1' }))).toBe(false)
  })
})

describe('refuseCashEntries', () => {
  it('accepts empty, plain and thousands-grouped amounts', () => {
    expect(
      refuseCashEntries([...sheet, row({ receipt: '20355520', payment: '1,000,000' })])
    ).toBeNull()
  })

  it.each(['-5000', '20.5', '12a', '1.00.000', '1e5'])('refuses %s', (amount) => {
    expect(refuseCashEntries([row({ receipt: amount })])).toBe(vi.shifts.cashEntries.invalidAmount)
    expect(refuseCashEntries([row({ payment: amount })])).toBe(vi.shifts.cashEntries.invalidAmount)
    expect(refuseCashEntries([row({ transfer: amount })])).toBe(vi.shifts.cashEntries.invalidAmount)
  })

  // Anh Nam: a Trả nợ cũ is written to one khách's sổ — with none picked it would vanish
  // from both the sổ and Tồn tiền mặt, so Lưu asks for the khách instead.
  it('refuses a Trả nợ cũ with no khách hàng picked', () => {
    expect(
      refuseCashEntries([row({ counterparty: 'Anh Ba', transfer: '500.000', repaysDebt: true })])
    ).toBe(vi.shifts.cashEntries.repaysDebtNeedsCustomer)
    expect(
      refuseCashEntries([row({ customerId: 'c-1', transfer: '500.000', repaysDebt: true })])
    ).toBeNull()
  })
})

describe('normalizeCashEntries', () => {
  it('drops blank rows, trims text and parses amounts in order', () => {
    expect(normalizeCashEntries(sheet)).toEqual([
      {
        content: 'Phí chuyển khoản',
        customerId: null,
        counterparty: '',
        receipt: null,
        payment: 33122,
        chargesDebt: false,
        transfer: null,
        repaysDebt: false,
      },
      {
        content: 'Nộp tiền',
        customerId: null,
        counterparty: 'Vietcombank',
        receipt: null,
        payment: 20355520,
        chargesDebt: false,
        transfer: null,
        repaysDebt: false,
      },
    ])
  })

  it('trims text around the cells', () => {
    expect(normalizeCashEntries([row({ content: ' Thu hộ ', receipt: ' 500 ' })])).toEqual([
      {
        content: 'Thu hộ',
        customerId: null,
        counterparty: '',
        receipt: 500,
        payment: null,
        chargesDebt: false,
        transfer: null,
        repaysDebt: false,
      },
    ])
  })

  it('keeps a picked khách hàng and drops any typed text beside it', () => {
    expect(
      normalizeCashEntries([
        row({ customerId: 'c-1', counterparty: 'Tiến Oanh', receipt: '1.000' }),
      ])
    ).toEqual([
      {
        content: '',
        customerId: 'c-1',
        counterparty: '',
        receipt: 1000,
        payment: null,
        chargesDebt: false,
        transfer: null,
        repaysDebt: false,
      },
    ])
  })
})

describe('cashEntryTotals', () => {
  it('sums Thu, Chi and Chuyển khoản like the sheet’s Tổng row', () => {
    expect(cashEntryTotals([...sheet, row({ transfer: '1.500.000' })])).toEqual({
      receipt: 0,
      payment: 20388642,
      transfer: 1_500_000,
    })
  })

  it('skips an amount that is not yet a valid number', () => {
    expect(cashEntryTotals([row({ receipt: '12a' }), row({ receipt: '1.000' })])).toEqual({
      receipt: 1000,
      payment: 0,
      transfer: 0,
    })
  })
})

// Anh Nam, 30/09: a chuyển khoản is either for fuel sold in the ca (TH2 — not in the két,
// so off Tồn tiền mặt) or a khách paying an older nợ (TH1 — the sổ only, never the két).
describe('chuyển khoản', () => {
  const entries = normalizeCashEntries([
    row({ content: 'Khách đổ xăng dầu ck cty', transfer: '3.000.000' }),
    row({ content: 'Tiến Oanh trả nợ', customerId: 'to', transfer: '5.000.000', repaysDebt: true }),
    row({ content: 'Ck trong ca', customerId: 'to', transfer: '700.000' }),
  ])

  it('takes only a chuyển khoản trong ca off Tồn tiền mặt', () => {
    expect(entries.map(inShiftTransferOf)).toEqual([3_000_000, 0, 700_000])
  })

  it('writes a Trả nợ cũ, and only it, to the khách’s sổ as thu nợ', () => {
    expect(debtPaymentsOf(entries)).toEqual([
      { customerId: 'to', amount: 5_000_000, note: 'Tiến Oanh trả nợ' },
    ])
  })

  it('keeps no Trả nợ cũ tick on a row with no chuyển khoản', () => {
    expect(
      normalizeCashEntries([row({ customerId: 'to', receipt: '1.000', repaysDebt: true })])[0]
        ?.repaysDebt
    ).toBe(false)
  })
})

describe('debtPaymentsOf', () => {
  it('reads only Thu rows naming a khách hàng as thu nợ', () => {
    const entries = normalizeCashEntries([
      row({ content: 'Trả nợ', customerId: 'c-1', receipt: '300.000' }),
      row({ customerId: 'c-2', receipt: '50.000' }),
      row({ content: 'Hoàn tiền', customerId: 'c-1', payment: '10.000' }),
      row({ content: 'Thu hộ', counterparty: 'Anh Ba', receipt: '20.000' }),
    ])
    expect(debtPaymentsOf(entries)).toEqual([
      { customerId: 'c-1', amount: 300_000, note: 'Trả nợ' },
      { customerId: 'c-2', amount: 50_000, note: null },
    ])
  })
})

describe('debtChargesOf', () => {
  // DAKNONG3 28/09: two nhân viên tạm ứng beside a nộp tiền that is not anybody's debt.
  it('reads only Chi rows naming a khách hàng and ticked Ghi nợ as khoản nợ', () => {
    const entries = normalizeCashEntries([
      row({
        content: 'Nhân viên tạm ứng',
        customerId: 'hlan',
        payment: '7.500.000',
        chargesDebt: true,
      }),
      row({ content: 'Nộp tiền VK', customerId: 'vk', payment: '29.912.200' }),
      row({ content: 'Tạm ứng', counterparty: 'Anh Ba', payment: '100.000', chargesDebt: true }),
      row({ customerId: 'kket', receipt: '50.000', chargesDebt: true }),
    ])
    expect(debtChargesOf(entries)).toEqual([
      { customerId: 'hlan', amount: 7_500_000, note: 'Nhân viên tạm ứng' },
    ])
    // A typed đối tượng has no sổ: its tick is not stored.
    expect(entries[2]?.chargesDebt).toBe(false)
  })
})
