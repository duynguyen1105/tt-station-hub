// Book stock (tồn sổ sách) from the opening anchor Trường Thịnh provides:
// sổ sách = đầu kỳ + nhập − xuất ± điều chỉnh, counted over the inventory
// movements dated on/after the opening's effective date. Sales movements come
// from shift completion (electronic-meter deltas), which already include the
// debt fills — fuel sold on credit still leaves through the pump.

export type BookMovement = {
  /** 'import' | 'sale' | 'adjustment' | 'physical_count' */
  movementType: string
  /** Signed liters as stored: imports positive, sales negative. */
  quantity: number
  /** Calendar day (date-only). */
  movementDate: Date
}

export type BookSummary = {
  openingLiters: number
  importedLiters: number
  soldLiters: number
  adjustedLiters: number
  bookStock: number
}

export type DayLedgerRow = {
  /** YYYY-MM-DD of the day. */
  date: string
  openingOfDay: number
  importedLiters: number
  soldLiters: number
  adjustedLiters: number
  closingOfDay: number
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Sums a fuel's movements since the opening date into the four book
 * components. Movements dated before the opening's effective date belong to
 * the previous anchor and are ignored.
 */
export function bookSummary(
  openingLiters: number,
  effectiveDate: Date,
  movements: BookMovement[]
): BookSummary {
  let imported = 0
  let sold = 0
  let adjusted = 0
  const since = dayKey(effectiveDate)
  for (const m of movements) {
    if (dayKey(m.movementDate) < since) continue
    if (m.movementType === 'import') imported += m.quantity
    else if (m.movementType === 'sale') sold += -m.quantity
    else adjusted += m.quantity // 'adjustment' | 'physical_count' keep their sign
  }
  return {
    openingLiters,
    importedLiters: imported,
    soldLiters: sold,
    adjustedLiters: adjusted,
    bookStock: openingLiters + imported - sold + adjusted,
  }
}

/**
 * The day-by-day ledger: each day with any movement becomes a row carrying its
 * own opening (the previous day's closing), the day's imports/sales/
 * adjustments, and its closing. Rows come back newest-first for display.
 */
export function dailyLedger(
  openingLiters: number,
  effectiveDate: Date,
  movements: BookMovement[]
): DayLedgerRow[] {
  const since = dayKey(effectiveDate)
  const byDay = new Map<string, { imported: number; sold: number; adjusted: number }>()
  for (const m of movements) {
    const key = dayKey(m.movementDate)
    if (key < since) continue
    let day = byDay.get(key)
    if (!day) {
      day = { imported: 0, sold: 0, adjusted: 0 }
      byDay.set(key, day)
    }
    if (m.movementType === 'import') day.imported += m.quantity
    else if (m.movementType === 'sale') day.sold += -m.quantity
    else day.adjusted += m.quantity
  }

  const rows: DayLedgerRow[] = []
  let running = openingLiters
  for (const key of [...byDay.keys()].sort()) {
    const day = byDay.get(key)!
    const closing = running + day.imported - day.sold + day.adjusted
    rows.push({
      date: key,
      openingOfDay: running,
      importedLiters: day.imported,
      soldLiters: day.sold,
      adjustedLiters: day.adjusted,
      closingOfDay: closing,
    })
    running = closing
  }
  return rows.reverse()
}
