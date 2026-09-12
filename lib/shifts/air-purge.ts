// What a Xả gió may be. Pure — the litres as kế toán typed them and the trụ's own Lít ĐT
// in, a refusal or null out — so the cell on screen and the route it posts to turn away
// exactly the same entries, and the form can never accept what the request would refuse.
//
// The refusals are Vietnamese here rather than in the route, in the style of
// lib/shifts/completion.ts: what a purge may be is a fact of the rule, not of the screen.
import { vi } from '@/messages/vi'

// A plain decimal literal — digits and an optional fractional tail — which is all the
// column can hold. `Number()` would also swallow "1e5", "0x1a" and " 12 ", each of which
// reaches a Decimal(15,3) as a database error rather than as an answer. It also swallows
// "1,824.76" — the grouped form this rule's own refusal prints — as NaN, so the shape
// belongs to the rule and not only to the route: kế toán must be told, at the cell, that
// the retype was not a number.
const decimalLiteral = /^-?\d+(\.\d+)?$/

/**
 * Why this Xả gió cannot be recorded against the trụ, or null when it can. Takes the
 * litres as typed and posted — a string, or null for an empty cell.
 *
 * An air purge cannot exceed the litres the đồng hồ điện tử counted: no more fuel can be
 * pushed through the line than passed through the meter, and a 2000 keyed in for 20 would
 * drive the litres sold negative and travel all the way to kế toán's MISA file before
 * anyone noticed. **Equal** is legal — a trụ that did nothing all ca but push air out of
 * the line is a real situation, and it sells nothing. Zero is legal too, and means an air
 * purge of no litres, which is a different answer from no air purge at all (null, always
 * allowed: it is how one is undone).
 *
 * A trụ whose Lít ĐT cannot be computed — either end of the đồng hồ điện tử still
 * missing — offers no limit to measure against, so an air purge on it is refused rather
 * than waved through to be checked once the meter arrives.
 *
 * Deliberately stricter than the one other netting rule in this codebase: the MISA export
 * only *warns* when bán nợ exceeds the metered litres, because a chuyến duyệt'd late
 * genuinely produces that. A xả gió above the meter has no legitimate cause, so it is
 * refused instead of flagged.
 */
export function refuseAirPurge(
  liters: string | null,
  electronicLiters: number | null
): string | null {
  // No air purge at all is always allowed: an empty cell is how one is undone.
  if (liters === null) return null
  if (!decimalLiteral.test(liters)) return vi.shifts.airPurgeNotANumber
  const value = Number(liters)
  if (value < 0) return vi.shifts.airPurgeNegative
  if (electronicLiters === null) return vi.shifts.airPurgeNoElectronicLiters
  if (value > electronicLiters) {
    // The limit is named as the plain figure kế toán can type straight back into the
    // cell, not through `formatLiters`: its comma grouping and fixed 2 decimals would
    // announce a ceiling of 1824.765 as "1,824.77" — a number this very rule refuses,
    // and which the cell then refuses again for the comma.
    return vi.shifts.airPurgeAboveMeter(String(electronicLiters))
  }
  return null
}
