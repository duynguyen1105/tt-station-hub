import { describe, expect, it } from 'vitest'

import {
  type CustomerLedgerRow,
  type LedgerKind,
  customerLedgerSelection,
  hasCustomerLedgerFilter,
} from '@/lib/debts/customer-ledger-selection'

const OPENING = 1_000_000

/** A sổ công nợ chained from OPENING, oldest first — the order the page builds it in. */
function chain(lines: [string, LedgerKind, string | null, number][]): CustomerLedgerRow[] {
  let balance = OPENING
  return lines.map(([date, kind, plate, amount]) => {
    balance += kind === 'payment' ? -amount : amount
    return { date, kind, plate, amount, balance }
  })
}

const ROWS = chain([
  ['2026-07-30', 'sale', '48C-111.11', 500_000], // 1 500 000
  ['2026-08-01', 'sale', '48C-222.22', 300_000], // 1 800 000
  ['2026-08-05', 'payment', null, 800_000], // 1 000 000
  ['2026-08-05', 'advance', null, 100_000], // 1 100 000
  ['2026-08-31', 'sale', '48C-111.11', 200_000], // 1 300 000
  ['2026-09-02', 'payment', null, 300_000], // 1 000 000
])

/** Just the ngày and loại of what survived. */
function kept(rows: CustomerLedgerRow[]): string[] {
  return rows.map((r) => `${r.date} ${r.kind}`)
}

describe('customerLedgerSelection', () => {
  it('hands back the whole sổ when nothing narrows, between nợ đầu kỳ and the last balance', () => {
    const sel = customerLedgerSelection({}, OPENING, ROWS)
    expect(kept(sel.rows)).toEqual(kept(ROWS))
    expect(sel.openingOfRange).toBe(OPENING)
    expect(sel.closingOfRange).toBe(1_000_000)
    expect(sel.totals).toEqual({ charge: 1_100_000, payment: 1_100_000 })
    expect(hasCustomerLedgerFilter(sel)).toBe(false)
  })

  it('keeps both ngày bounds inclusive and carries the true Dư nợ in and out of the range', () => {
    const sel = customerLedgerSelection({ from: '2026-08-01', to: '2026-08-31' }, OPENING, ROWS)
    expect(kept(sel.rows)).toEqual([
      '2026-08-01 sale',
      '2026-08-05 payment',
      '2026-08-05 advance',
      '2026-08-31 sale',
    ])
    expect(sel.openingOfRange).toBe(1_500_000)
    expect(sel.closingOfRange).toBe(1_300_000)
    expect(sel.totals).toEqual({ charge: 600_000, payment: 800_000 })
  })

  it('sums only the lines a loại picks, while the closing Dư nợ stays what the khách owes', () => {
    const sel = customerLedgerSelection(
      { from: '2026-08-01', to: '2026-08-31', type: 'payment' },
      OPENING,
      ROWS
    )
    expect(kept(sel.rows)).toEqual(['2026-08-05 payment'])
    expect(sel.totals).toEqual({ charge: 0, payment: 800_000 })
    expect(sel.closingOfRange).toBe(1_300_000)
  })

  it('narrows to a biển số without shrinking what the menu offers', () => {
    const sel = customerLedgerSelection({ plate: '48C-111.11' }, OPENING, ROWS)
    expect(kept(sel.rows)).toEqual(['2026-07-30 sale', '2026-08-31 sale'])
    expect(sel.totals.charge).toBe(700_000)
    expect(sel.plateOptions).toEqual(['48C-111.11', '48C-222.22'])
  })

  it('ignores a loại or biển số the sổ does not hold, and a ngày that does not exist', () => {
    const sel = customerLedgerSelection(
      { type: 'refund', plate: '99Z-000.00', from: '2026-02-30' },
      OPENING,
      ROWS
    )
    expect(sel.rows).toHaveLength(ROWS.length)
    expect(hasCustomerLedgerFilter(sel)).toBe(false)
  })

  it('reads a range with no lines in it as the Dư nợ carried into it', () => {
    const sel = customerLedgerSelection({ from: '2026-08-10', to: '2026-08-20' }, OPENING, ROWS)
    expect(sel.rows).toEqual([])
    expect(sel.openingOfRange).toBe(1_100_000)
    expect(sel.closingOfRange).toBe(1_100_000)
  })
})
