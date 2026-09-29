// Sổ công nợ theo ngày: every balance is computed from the ledger (DebtTransaction rows),
// anchored at the khách's nợ đầu kỳ.
import { type DebtTx, computeBalance } from '@/lib/debts/aging'

/** Nợ đầu kỳ at the START of openingDate (YYYY-MM-DD); no date = 0 from the first transaction. */
export type LedgerAnchor = { openingBalance: number; openingDate: string | null }
/**
 * A DebtTransaction reduced to what the sổ reads; txDate is YYYY-MM-DD. `advance`: a
 * charge from a ca's Thu chi table (a Chi ticked Ghi nợ — a tạm ứng), not a bán nợ.
 */
export type LedgerTx = DebtTx & { txDate: string; advance?: boolean }
export type DebtDay = {
  opening: number
  charged: number
  chargeCount: number
  advanced: number
  paid: number
  closing: number
}

/** YYYY-MM-DD of a @db.Date value (Prisma returns UTC midnight). */
export function dayKeyOf(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Transactions the anchor counts: txDate >= openingDate, or all when openingDate is null. */
export function countedTxs(anchor: LedgerAnchor, txs: LedgerTx[]): LedgerTx[] {
  const from = anchor.openingDate
  return from === null ? txs : txs.filter((tx) => tx.txDate >= from)
}

/** Dư nợ now. */
export function balanceOf(anchor: LedgerAnchor, txs: LedgerTx[]): number {
  return computeBalance(anchor.openingBalance, countedTxs(anchor, txs))
}

/** One day of the sổ; null for a day before openingDate (the sổ does not reach back). */
export function debtDay(anchor: LedgerAnchor, txs: LedgerTx[], day: string): DebtDay | null {
  if (anchor.openingDate !== null && day < anchor.openingDate) return null
  const counted = countedTxs(anchor, txs)
  const opening = computeBalance(
    anchor.openingBalance,
    counted.filter((tx) => tx.txDate < day)
  )
  let charged = 0
  let chargeCount = 0
  let advanced = 0
  let paid = 0
  for (const tx of counted) {
    if (tx.txDate !== day) continue
    if (tx.txType === 'charge' && tx.advance) advanced += tx.amount
    else if (tx.txType === 'charge') {
      charged += tx.amount
      chargeCount++
    } else paid += tx.amount
  }
  return {
    opening,
    charged,
    chargeCount,
    advanced,
    paid,
    closing: opening + charged + advanced - paid,
  }
}
