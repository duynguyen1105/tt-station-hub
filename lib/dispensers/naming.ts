// What a trụ is called once a kế toán installs one, and the hầm code it draws from.
// Pure — a số in, the strings the row stores out — so what a form writes can be checked
// against what a photo resolves to without a database.
import { dispenserKey } from '@/lib/matching/photo-to-reading'

/** "Trụ 4" — the tên printed on the plate and shown on every screen. */
export function dispenserNameFor(pumpNumber: number): string {
  return `Trụ ${pumpNumber}`
}

/**
 * "TRU_4" — the trụ's code, made by running its own tên through the canonical key the
 * photo matcher resolves a plate to. Built that way rather than templated so a trạm and
 * a photo can never be on two naming schemes: whatever `dispenserKey` makes of "TRỤ 4"
 * read off a biển is by construction the code trụ số 4 was stored as.
 *
 * Never null — a số trụ is a positive whole number, so the tên always carries the
 * TRU+number the key matches on.
 */
export function dispenserCodeFor(pumpNumber: number): string {
  return dispenserKey(dispenserNameFor(pumpNumber))!
}

/**
 * "HAM_3" — the hầm a trụ draws from, from its số hầm. The same canonical form
 * `tankCodeFromLabel` resolves a paper biên bản label to, so a hầm typed here and a hầm
 * read off a biên bản are the same string — which is what lets the barem cross-check
 * and the phiếu nhập line up against it.
 */
export function tankCodeFor(tankNumber: number): string {
  return `HAM_${tankNumber}`
}

/**
 * The số hầm behind a hầm code, so Chỉnh sửa shows back the number that was typed.
 * Null for a trụ drawing from no hầm, and for a code carrying no số — nothing is
 * invented for one this form did not write.
 */
export function tankNumberFrom(tankCode: string | null): number | null {
  const match = tankCode?.match(/^HAM_(\d+)$/)
  return match ? Number(match[1]) : null
}
