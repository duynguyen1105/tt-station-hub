// Debt balance, aging and payment allocation (build plan §5.1).

const DAY_MS = 24 * 60 * 60 * 1000

export type DebtTx = {
  txType: 'charge' | 'payment'
  amount: number
}

/** Balance = opening + charges − payments. */
export function computeBalance(opening: number, txs: DebtTx[]): number {
  return txs.reduce(
    (balance, tx) => balance + (tx.txType === 'charge' ? tx.amount : -tx.amount),
    opening
  )
}

export type AgedCharge = { amount: number; date: Date }

export type AgingBuckets = {
  current: number // 0-30 days
  d31_60: number
  d61_90: number
  over90: number
}

export function agingBuckets(charges: AgedCharge[], now: Date): AgingBuckets {
  const buckets: AgingBuckets = { current: 0, d31_60: 0, d61_90: 0, over90: 0 }
  for (const charge of charges) {
    const age = Math.floor((now.getTime() - charge.date.getTime()) / DAY_MS)
    if (age <= 30) buckets.current += charge.amount
    else if (age <= 60) buckets.d31_60 += charge.amount
    else if (age <= 90) buckets.d61_90 += charge.amount
    else buckets.over90 += charge.amount
  }
  return buckets
}

export type OpenCharge = { id: string; remaining: number; date: Date }
export type Allocation = { chargeId: string; applied: number }

/** Applies a payment to the oldest open charges first (FIFO). */
export function allocatePayment(amount: number, charges: OpenCharge[]): Allocation[] {
  const sorted = [...charges].sort((a, b) => a.date.getTime() - b.date.getTime())
  let remaining = amount
  const allocations: Allocation[] = []
  for (const charge of sorted) {
    if (remaining <= 0) break
    const applied = Math.min(remaining, charge.remaining)
    if (applied > 0) {
      allocations.push({ chargeId: charge.id, applied })
      remaining -= applied
    }
  }
  return allocations
}
