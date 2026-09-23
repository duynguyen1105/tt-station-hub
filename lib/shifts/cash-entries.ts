// Thu chi tiền mặt – Khách CK: the kế toán's hand-typed cash in/out table on a ca. Pure —
// the rows as typed in, a refusal / the rows to store / the Tổng out — so the table on
// screen and the route it posts to accept exactly the same entries.
//
// A Thu row naming a khách hàng is that khách's thu nợ: saving the table rewrites the
// ca's payments in the sổ công nợ (sourceRef `cash:<shiftId>`). Every other row — Chi,
// or Thu with no khách — is a note; chốt ca, stock and the MISA export ignore them.
import { vi } from '@/messages/vi'

/** sourceRef prefix of a DebtTransaction payment written from a ca's Thu chi table. */
export const CASH_PAYMENT_REF_PREFIX = 'cash:'

export function cashPaymentRef(shiftId: string): string {
  return `${CASH_PAYMENT_REF_PREFIX}${shiftId}`
}

/**
 * One row as typed: Nội dung, Đối tượng, Thu, Chi. Đối tượng is a khách hàng picked from
 * the list (`customerId`) or, when the other side is no customer, free text
 * (`counterparty`). Amounts stay strings until stored.
 */
export type CashEntryInput = {
  content: string
  customerId: string | null
  counterparty: string
  receipt: string
  payment: string
}

/** One row as stored: text trimmed, amounts whole đồng or null for an empty cell. */
export type CashEntry = {
  content: string
  customerId: string | null
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

/** A row with nothing typed or picked in any of its cells — dropped rather than stored. */
export function isBlankCashEntry(row: CashEntryInput): boolean {
  return (
    row.customerId === null &&
    [row.content, row.counterparty, row.receipt, row.payment].every((v) => v.trim() === '')
  )
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
      customerId: row.customerId,
      // A picked khách hàng is the Đối tượng; typed text only stands in for a non-customer.
      counterparty: row.customerId === null ? row.counterparty.trim() : '',
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

/** The thu nợ these rows record: every Thu amount on a row naming a khách hàng. */
export function debtPaymentsOf(
  entries: CashEntry[]
): { customerId: string; amount: number; note: string | null }[] {
  return entries.flatMap((e) =>
    e.customerId !== null && e.receipt !== null && e.receipt > 0
      ? [{ customerId: e.customerId, amount: e.receipt, note: e.content || null }]
      : []
  )
}
