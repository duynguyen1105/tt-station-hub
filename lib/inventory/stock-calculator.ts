// Estimated-stock calculation (build plan §3.2).
// Movement quantity is signed: + for imports, - for sales (see schema).

export type StockMovement = {
  movementType: 'import' | 'sale' | 'physical_count' | 'adjustment'
  quantity: number
}

/**
 * Estimated stock = opening + signed movements, applied in order.
 * A `physical_count` resets the running balance to the measured value.
 * Pass movements sorted by date (oldest first).
 */
export function computeEstimatedStock(opening: number, movements: StockMovement[]): number {
  let stock = opening
  for (const movement of movements) {
    if (movement.movementType === 'physical_count') {
      stock = movement.quantity
    } else {
      stock += movement.quantity
    }
  }
  return stock
}

/** physical − estimated. Positive = surplus, negative = shortage. */
export function computeVariance(physical: number, estimated: number): number {
  return physical - estimated
}

export function isLowStock(estimated: number, threshold: number | null): boolean {
  if (threshold == null) return false
  return estimated <= threshold
}
