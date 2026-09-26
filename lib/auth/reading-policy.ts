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
 * Opening repair is admin-only. Shift locking is checked at call sites: debt
 * opening balances also use this predicate and have no shift status.
 */
export function canEditOpening(role: AppRole): boolean {
  return role === 'admin'
}

/**
 * A completed ca is locked until an admin reopens it, including for the admin.
 */
export function canEditClosing(role: AppRole, shiftStatus: ShiftStatus): boolean {
  return (role === 'admin' || role === 'accountant') && shiftStatus !== 'completed'
}

/**
 * Air purge changes the ca's sale, so it follows the completed-ca lock.
 * Human approval of a reading does not independently freeze air purge.
 */
export function canEditAirPurge(role: AppRole, shiftStatus: ShiftStatus): boolean {
  return canEditClosing(role, shiftStatus)
}

/**
 * Reviewing a ca — approve / reject / chốt — follows the same rule as editing a
 * closing.
 */
export function canReviewShift(role: AppRole, shiftStatus: ShiftStatus): boolean {
  return canEditClosing(role, shiftStatus)
}

/**
 * Creating a ca's reading by hand follows the closing rule. Editing an opening
 * on that row additionally requires canEditOpening.
 */
export function canCreateReading(role: AppRole, shiftStatus: ShiftStatus): boolean {
  return canEditClosing(role, shiftStatus)
}

/**
 * Editing a ca's Thu chi tiền mặt – Khách CK table — admin and accountant at any
 * status, viewer never. Unlike the closing rule, chốt ca does not lock it, so kế toán
 * may keep filling it in after chốt. Not a harmless note: a Thu row naming a khách hàng
 * is that khách's thu nợ, so saving the table rewrites the ca's payments in the sổ.
 */
export function canEditCashEntries(role: AppRole): boolean {
  return role === 'admin' || role === 'accountant'
}

/**
 * Whether a human has decided on a row (as opposed to AI auto-approval).
 */
export function isReadingDecided(
  reviewStatus: string | null
): reviewStatus is 'approved' | 'rejected' {
  return reviewStatus === 'approved' || reviewStatus === 'rejected'
}

/** Only admin may repair a decided reading; its decision remains in place. */
export function isReadingFrozen(role: AppRole, reviewStatus: string | null): boolean {
  return role !== 'admin' && isReadingDecided(reviewStatus)
}

/** New AI warnings do not undo a human Duyệt / Từ chối when a value is repaired. */
export function reviewStatusAfterEdit(previous: string | null, derived: string): string {
  return isReadingDecided(previous) ? previous : derived
}
