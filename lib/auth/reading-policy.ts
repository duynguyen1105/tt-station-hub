import { type AppRole } from '@/lib/auth/permissions'

/**
 * The pure source of truth for who may act on a ca's meter readings. Pure
 * predicates over the domain vocabulary — role, which reading is being touched
 * (opening vs closing), and the ca's shift status — shared by the server
 * endpoints and the client so they cannot disagree. See docs/adr/0001.
 */

/**
 * Shift lifecycle status. Mirrors the `Shift.status` values in
 * `prisma/schema.prisma`. The reading-edit lock triggers on `completed` only;
 * every other status — including `cancelled` — follows the normal pre-completed
 * rule.
 */
export type ShiftStatus =
  | 'open'
  | 'collecting_photos'
  | 'ai_processing'
  | 'pending_review'
  | 'completed'
  | 'cancelled'

/**
 * Editing an opening reading (Đầu ĐT / Đầu Cơ) — admin only, at any shift status.
 * The opening is the immutable carry-forward of the prior ca's closing, so
 * repairing it is an exceptional, admin-only act.
 */
export function canEditOpening(role: AppRole): boolean {
  return role === 'admin'
}

/**
 * Editing a closing reading (Cuối ĐT / Cuối Cơ) — admin at any status, or
 * accountant while the ca is not yet `completed`. viewer never. After chốt only
 * the admin remains, as the escape hatch.
 */
export function canEditClosing(role: AppRole, shiftStatus: ShiftStatus): boolean {
  if (role === 'admin') return true
  if (role === 'accountant') return shiftStatus !== 'completed'
  return false
}

/**
 * Reviewing a ca — approve / reject / chốt — follows the same rule as editing a
 * closing.
 */
export function canReviewShift(role: AppRole, shiftStatus: ShiftStatus): boolean {
  return canEditClosing(role, shiftStatus)
}

/**
 * Creating a ca's reading by hand — for a Trụ no photo ever arrived for — follows
 * the same rule as editing a closing: admin at any status, accountant until chốt.
 * The opening of the row so created is still admin-only, per `canEditOpening`.
 */
export function canCreateReading(role: AppRole, shiftStatus: ShiftStatus): boolean {
  return canEditClosing(role, shiftStatus)
}

/**
 * Whether a row's Duyệt / Từ chối call has been made. A decided row's values are
 * frozen for every role — the numbers are what the decision was made on, so
 * changing them behind the decision would silently un-decide the row. Note
 * `auto_approved` is the AI's own high-confidence pass, not a human decision, so
 * it does not freeze the row: correcting an AI misread before chốt is routine.
 */
export function isReadingDecided(reviewStatus: string | null): boolean {
  return reviewStatus === 'approved' || reviewStatus === 'rejected'
}
