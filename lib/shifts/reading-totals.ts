// What a Trụ's row of the Chốt ca table says about the litres it moved and what they
// are worth. Pure — plain numbers in, plain numbers out — so the rules are testable
// without React or Prisma, and both the page and its tests read the same arithmetic.

/** A reading's four meter values as the table holds them (a missing value is null). */
export type ReadingMeters = {
  openingElectronicReading: number | null
  electronicReading: number | null
  openingMechanicalReading: number | null
  mechanicalReading: number | null
}

/**
 * Litres between an opening and a closing on one meter, or null when either end is
 * missing — a Trụ with no ảnh yet has nothing to subtract, and 0 (a Trụ that did not
 * move) is a real answer, not a missing one.
 */
export function meterGap(opening: number | null, closing: number | null): number | null {
  if (opening === null || closing === null) return null
  return round3(closing - opening)
}

/** Litres on the đồng hồ điện tử — the figure the MISA export prices a ca by. */
export function electronicGap(meters: ReadingMeters): number | null {
  return meterGap(meters.openingElectronicReading, meters.electronicReading)
}

/** Litres on the đồng hồ cơ, the mechanical cross-check of the same litres. */
export function mechanicalGap(meters: ReadingMeters): number | null {
  return meterGap(meters.openingMechanicalReading, meters.mechanicalReading)
}

/**
 * Chênh lệch điện − cơ: how far the two đồng hồ disagree about the same litres.
 * Null when either meter lacks an end to subtract from *and* when the two agree —
 * the column shows '—' in both cases, since a row with nothing to flag should not
 * make the reviewer read a zero.
 */
export function meterGapDifference(meters: ReadingMeters): number | null {
  const electronic = electronicGap(meters)
  const mechanical = mechanicalGap(meters)
  if (electronic === null || mechanical === null) return null
  const difference = round3(electronic - mechanical)
  return difference === 0 ? null : difference
}

/**
 * Tổng tiền for the row: the đồng hồ điện tử's litres at the giá bán lẻ in force on
 * the ca's ngày. Always the electronic meter, never the cơ — that is the meter the
 * MISA sales voucher bills by, so the screen and the file can never disagree. Null
 * when the litres or the price are unknown.
 */
export function readingAmount(meters: ReadingMeters, unitPrice: number | null): number | null {
  const litres = electronicGap(meters)
  if (litres === null || unitPrice === null) return null
  return litres * unitPrice
}

/** Meters carry 3 decimals, so trim the float dust subtraction leaves behind. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}
