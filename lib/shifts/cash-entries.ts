// Thu chi tiền mặt – Khách CK: the kế toán's hand-typed cash in/out note on a ca. Pure —
// the rows as typed in, a refusal / the rows to store / the Tổng out — so the table on
// screen and the route it posts to accept exactly the same entries.
//
// Nothing else on the ca reads these rows: chốt ca, stock and the MISA export ignore
// them. They are a note, and stay one.
import { vi } from '@/messages/vi'

/** One row as typed: Nội dung, Đối tượng, Thu, Chi. Amounts stay strings until stored. */
export type CashEntryInput = {
  content: string
  counterparty: string
  receipt: string
  payment: string
}

/** One row as stored: text trimmed, amounts whole đồng or null for an empty cell. */
export type CashEntry = {
  content: string
  counterparty: string
  receipt: number | null
  payment: number | null
}

// Whole đồng, either plain ("20355520") or grouped by thousands the way the Excel sheet
// shows it ("20.355.520", "20,355,520"). A decimal tail like "20.5" is not grouping and
// is refused — VND has no fractions.
const wholeDong = /^(\d+|\d{1,3}([.,]\d{3})+)$/

function parseAmount(value: string): number | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : Number(trimmed.replace(/[.,]/g, ''))
}

/** A row with nothing typed in any of its four cells — dropped rather than stored. */
export function isBlankCashEntry(row: CashEntryInput): boolean {
  return [row.content, row.counterparty, row.receipt, row.payment].every((v) => v.trim() === '')
}

/** Why these rows cannot be saved, or null when they can. Only the amounts are checked. */
export function refuseCashEntries(rows: CashEntryInput[]): string | null {
  for (const row of rows) {
    for (const amount of [row.receipt, row.payment]) {
      const trimmed = amount.trim()
      if (trimmed !== '' && !wholeDong.test(trimmed)) return vi.shifts.cashEntries.invalidAmount
    }
  }
  return null
}

/** The rows to store, in order: blank rows dropped, text trimmed, amounts parsed. */
export function normalizeCashEntries(rows: CashEntryInput[]): CashEntry[] {
  return rows
    .filter((row) => !isBlankCashEntry(row))
    .map((row) => ({
      content: row.content.trim(),
      counterparty: row.counterparty.trim(),
      receipt: parseAmount(row.receipt),
      payment: parseAmount(row.payment),
    }))
}

/** The Tổng row: Thu and Chi summed, skipping any amount that is not yet a valid number. */
export function cashEntryTotals(rows: CashEntryInput[]): { receipt: number; payment: number } {
  let receipt = 0
  let payment = 0
  for (const row of rows) {
    if (wholeDong.test(row.receipt.trim())) receipt += parseAmount(row.receipt) ?? 0
    if (wholeDong.test(row.payment.trim())) payment += parseAmount(row.payment) ?? 0
  }
  return { receipt, payment }
}
