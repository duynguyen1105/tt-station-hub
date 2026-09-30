// Tồn tiền mặt of a ca, as the phiếu chốt ca sums it: tiền đầu ngày + tổng tiền bán −
// chuyển khoản trong ca + tổng thu − tổng chi − tổng nợ = tồn cuối ngày, and a ca's cuối
// ngày is the next ca's đầu ngày. Tổng tiền bán counts every litre sold, however the khách
// paid, so what they paid by chuyển khoản or on nợ is taken back out — neither is in the
// két. Pure — per-ca totals in, the chain out — so it is testable without Prisma;
// lib/shifts/load-cash-balance.ts reads the totals.

/** One ca's money, in whole đồng. */
export type CashDay = {
  shiftId: string
  /** Σ Tổng tiền of its trụ (litres sold × giá bán lẻ). */
  sales: number
  /** Σ Thu / Σ Chi of its Thu chi tiền mặt table. */
  receipts: number
  payments: number
  /** Σ Chuyển khoản that paid for fuel sold in the ca (a Trả nợ cũ is not one). */
  transfers: number
  /** Σ what its bán nợ charge to the sổ công nợ. */
  debts: number
}

export type CashBalanceLine = {
  opening: number
  sales: number
  transfers: number
  receipts: number
  payments: number
  debts: number
  closing: number
}

/**
 * Each ca's Tồn tiền mặt, chaining from the trạm's đầu kỳ through `days` in order (the
 * ca from the đầu kỳ's ngày on, oldest first).
 */
export function chainCashBalances(
  openingAmount: number,
  days: readonly CashDay[]
): Map<string, CashBalanceLine> {
  const lines = new Map<string, CashBalanceLine>()
  let opening = openingAmount
  for (const day of days) {
    const sales = Math.round(day.sales)
    const debts = Math.round(day.debts)
    const closing = opening + sales - day.transfers + day.receipts - day.payments - debts
    lines.set(day.shiftId, {
      opening,
      sales,
      transfers: day.transfers,
      receipts: day.receipts,
      payments: day.payments,
      debts,
      closing,
    })
    opening = closing
  }
  return lines
}
