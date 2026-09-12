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
 * A reading off the database in the shape these rules read: Prisma hands each meter back
 * as a Decimal, and the arithmetic here is plain numbers.
 */
export function readingMeters(reading: {
  openingElectronicReading: MeterColumn
  electronicReading: MeterColumn
  openingMechanicalReading: MeterColumn
  mechanicalReading: MeterColumn
}): ReadingMeters {
  return {
    openingElectronicReading: numberOrNull(reading.openingElectronicReading),
    electronicReading: numberOrNull(reading.electronicReading),
    openingMechanicalReading: numberOrNull(reading.openingMechanicalReading),
    mechanicalReading: numberOrNull(reading.mechanicalReading),
  }
}

/**
 * The two đồng hồ điện tử ends the litres sold are read from — named apart from
 * ReadingMeters so a caller holding no đồng hồ cơ can ask without inventing one.
 */
export type ElectronicMeter = Pick<ReadingMeters, 'openingElectronicReading' | 'electronicReading'>

/** A meter column as the database holds it, or null where nothing was read. */
type MeterColumn = { toNumber: () => number } | null

function numberOrNull(value: MeterColumn): number | null {
  return value === null ? null : value.toNumber()
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
export function electronicGap(meters: ElectronicMeter): number | null {
  return meterGap(meters.openingElectronicReading, meters.electronicReading)
}

/** Litres on the đồng hồ cơ, the mechanical cross-check of the same litres. */
export function mechanicalGap(meters: ReadingMeters): number | null {
  return meterGap(meters.openingMechanicalReading, meters.mechanicalReading)
}

/**
 * Chênh lệch điện − cơ: how far the two đồng hồ disagree about the same litres.
 * Null when either meter lacks an end to subtract from *and* when the two agree —
 * the Lít Cơ cell carries no marking in both cases, since a row with nothing to flag
 * should not make the reviewer read a zero.
 */
export function meterGapDifference(meters: ReadingMeters): number | null {
  const electronic = electronicGap(meters)
  const mechanical = mechanicalGap(meters)
  if (electronic === null || mechanical === null) return null
  const difference = round3(electronic - mechanical)
  return difference === 0 ? null : difference
}

/**
 * How many litres this trụ actually sold this ca: what the đồng hồ điện tử counted,
 * less the Xả gió. Purged fuel ran through the meter but went back into the hầm, so
 * nobody bought it. A null purge is no purge — the raw gap stands.
 *
 * The seam the question has exactly one answer through: Tổng tiền on the ca screen asks it
 * here, and so does the shift-sales computation behind the hầm movement and the MISA bán
 * lẻ line, so the two cannot come to subtract a Xả gió differently. The one subtraction
 * serves both — the litres sold and the litres drawn from the hầm fall together, because
 * the purged fuel went back in.
 *
 * Null only when the đồng hồ điện tử has no litres to start from — a purge of the whole
 * gap sells 0 litres, which is an answer, not a missing one.
 */
export function soldLiters(meters: ElectronicMeter, airPurgeLiters: number | null): number | null {
  const metered = electronicGap(meters)
  if (metered === null) return null
  if (airPurgeLiters === null) return metered
  return round3(metered - airPurgeLiters)
}

/**
 * Tổng tiền for the row: the litres this trụ sold at the giá bán lẻ in force on the ca's
 * ngày. Always the electronic meter, never the cơ — that is the meter the MISA sales
 * voucher bills by, so the screen and the file can never disagree. A Xả gió comes off
 * the litres first, so the row bills only what a customer took away. Null when the
 * litres or the price are unknown.
 */
export function readingAmount(
  meters: ReadingMeters,
  unitPrice: number | null,
  airPurgeLiters: number | null
): number | null {
  const litres = soldLiters(meters, airPurgeLiters)
  if (litres === null || unitPrice === null) return null
  return litres * unitPrice
}

/** Meters carry 3 decimals, so trim the float dust subtraction leaves behind. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}
