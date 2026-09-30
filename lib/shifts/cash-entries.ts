// Thu chi tiền mặt – Khách CK: the kế toán's hand-typed cash in/out table on a ca. Pure —
// the rows as typed in, a refusal / the rows to store / the Tổng out — so the table on
// screen and the route it posts to accept exactly the same entries.
//
// What reaches the sổ công nợ (sourceRef `cash:<shiftId>`, rewritten on every save):
// - a Thu naming a khách hàng — their thu nợ;
// - a Chi naming one, ticked Ghi nợ (a tạm ứng) — a khoản nợ of theirs;
// - a Chuyển khoản naming one, ticked Trả nợ cũ — their thu nợ, paid to the bank.
// Every other row is a note for the sổ; Tồn tiền mặt and the MISA export read them all.
import { vi } from '@/messages/vi'

/** sourceRef prefix of a DebtTransaction payment written from a ca's Thu chi table. */
export const CASH_PAYMENT_REF_PREFIX = 'cash:'

export function cashPaymentRef(shiftId: string): string {
  return `${CASH_PAYMENT_REF_PREFIX}${shiftId}`
}

/**
 * One row as typed: Nội dung, Đối tượng, Thu, Chi, Chuyển khoản. Đối tượng is a khách hàng
 * picked from the list (`customerId`) or, when the other side is no customer, free text
 * (`counterparty`). Amounts stay strings until stored.
 */
export type CashEntryInput = {
  content: string
  customerId: string | null
  counterparty: string
  receipt: string
  payment: string
  /** Ghi nợ: the Chi is money the đối tượng now owes (a tạm ứng), not money paid away. */
  chargesDebt: boolean
  /** Money a khách sent to the bank — fuel sold in the ca, or with repaysDebt an older nợ. */
  transfer: string
  /** Trả nợ cũ: the Chuyển khoản settles the picked khách's older nợ, not today's fuel. */
  repaysDebt: boolean
}

/** One row as stored: text trimmed, amounts whole đồng or null for an empty cell. */
export type CashEntry = {
  content: string
  customerId: string | null
  counterparty: string
  receipt: number | null
  payment: number | null
  chargesDebt: boolean
  transfer: number | null
  repaysDebt: boolean
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
    [row.content, row.counterparty, row.receipt, row.payment, row.transfer].every(
      (v) => v.trim() === ''
    )
  )
}

/**
 * Why these rows cannot be saved, or null when they can: an amount that is not whole
 * đồng, or a Trả nợ cũ with no khách hàng picked — there would be no sổ to pay into, and
 * the transfer would silently drop off both the sổ and Tồn tiền mặt.
 */
export function refuseCashEntries(rows: CashEntryInput[]): string | null {
  for (const row of rows) {
    for (const amount of [row.receipt, row.payment, row.transfer]) {
      const trimmed = amount.trim()
      if (trimmed !== '' && !wholeDong.test(trimmed)) return vi.shifts.cashEntries.invalidAmount
    }
    if (row.repaysDebt && row.transfer.trim() !== '' && row.customerId === null) {
      return vi.shifts.cashEntries.repaysDebtNeedsCustomer
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
      // Only a Chi naming a khách hàng can owe: a typed đối tượng has no sổ, a Thu is thu nợ.
      chargesDebt: row.customerId !== null && row.chargesDebt && row.payment.trim() !== '',
      transfer: parseAmount(row.transfer),
      // A tick with no Chuyển khoản beside it means nothing, so it is not kept.
      repaysDebt: row.customerId !== null && row.repaysDebt && row.transfer.trim() !== '',
    }))
}

/** The Tổng row: each amount column summed, skipping any cell not yet a valid number. */
export function cashEntryTotals(rows: CashEntryInput[]): {
  receipt: number
  payment: number
  transfer: number
} {
  const sum = (pick: (row: CashEntryInput) => string) =>
    rows.reduce((total, row) => {
      const cell = pick(row).trim()
      return wholeDong.test(cell) ? total + (parseAmount(cell) ?? 0) : total
    }, 0)
  return {
    receipt: sum((r) => r.receipt),
    payment: sum((r) => r.payment),
    transfer: sum((r) => r.transfer),
  }
}

/**
 * The Chuyển khoản that paid for fuel sold in this ca — what comes off Tồn tiền mặt. A
 * Trả nợ cũ is left out: that money was never part of the ca's tiền bán nor in the két.
 */
export function inShiftTransferOf(entry: { transfer: number | null; repaysDebt: boolean }): number {
  return entry.repaysDebt ? 0 : (entry.transfer ?? 0)
}

/**
 * The thu nợ these rows record: every Thu on a row naming a khách hàng, and every
 * Chuyển khoản naming one and ticked Trả nợ cũ.
 */
export function debtPaymentsOf(
  entries: CashEntry[]
): { customerId: string; amount: number; note: string | null }[] {
  return entries.flatMap((e) => {
    if (e.customerId === null) return []
    const note = e.content || null
    return [
      ...(e.receipt !== null && e.receipt > 0
        ? [{ customerId: e.customerId, amount: e.receipt, note }]
        : []),
      ...(e.repaysDebt && e.transfer !== null && e.transfer > 0
        ? [{ customerId: e.customerId, amount: e.transfer, note }]
        : []),
    ]
  })
}

/** The khoản nợ these rows record: every Chi on a row naming a khách hàng, ticked Ghi nợ. */
export function debtChargesOf(
  entries: CashEntry[]
): { customerId: string; amount: number; note: string | null }[] {
  return entries.flatMap((e) =>
    e.customerId !== null && e.chargesDebt && e.payment !== null && e.payment > 0
      ? [{ customerId: e.customerId, amount: e.payment, note: e.content || null }]
      : []
  )
}
