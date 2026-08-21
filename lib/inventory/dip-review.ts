import { type AppRole } from '@/lib/auth/permissions'

/**
 * Who may decide on a số đo bồn, and which đo hầm still counts as a hầm's tồn
 * thực tế. Pure predicates shared by the API routes and the row that renders the
 * buttons, so the two cannot disagree — same arrangement as
 * `lib/auth/reading-policy.ts` for a ca's chỉ số.
 */

/** The one status that takes a đo hầm out of the tồn thực tế. */
export const REJECTED_DIP = 'rejected'

/** A đo hầm nobody has decided on yet — the only kind whose số đo may be repaired. */
export const PENDING_DIP = 'pending'

/**
 * Reviewing a đo hầm — duyệt / từ chối — is admin or kế toán; a viewer never.
 *
 * Unlike `canReviewShift`, no status gates it: a đo hầm belongs to no ca, so
 * there is no chốt that closes the decision. A dip photographed on a day whose ca
 * has long been chốt is still the latest word on what is in the hầm, and kế toán
 * must be able to reject a misread one whenever it is noticed.
 */
export function canReviewTankDip(role: AppRole): boolean {
  return role === 'admin' || role === 'accountant'
}

/**
 * Who may repair an AI-misread số đo: a người duyệt, on a chờ xử lý dip only.
 *
 * Narrower than `canReviewTankDip` on purpose, and the one place a status does
 * gate a đo hầm. Duyệt / từ chối is a judgement, and an admin can reverse it; the
 * số đo is the fact underneath it, feeding the hầm's tồn thực tế and its Quy ra
 * lít. Moving that number after someone has decided would change what was
 * approved without anyone approving it again — so a decided dip's số đo is fixed,
 * and a genuinely misread one is từ chối instead, which is what từ chối is for.
 */
export function canCorrectTankDip(role: AppRole, reviewStatus: string): boolean {
  return canReviewTankDip(role) && reviewStatus === PENDING_DIP
}

/**
 * The đo hầm rows that still count as a trạm's tồn thực tế — everything except a
 * từ chối read, so the previous good dip takes over as the hầm's Thực tế and a
 * misread dip-stick stops skewing the đối chiếu against sổ sách.
 *
 * A `pending` dip is deliberately included: it is the newest thing anyone knows
 * about the hầm, and excluding it would leave Tổng quan stale for as long as it
 * takes someone to click Duyệt.
 *
 * Only for the figures a dip feeds. The Lịch sử đo bồn table itself lists every
 * row, từ chối ones included and badged, because the history is the audit trail.
 */
export function countableDipWhere(stationId: string) {
  return { stationId, reviewStatus: { not: REJECTED_DIP } }
}
