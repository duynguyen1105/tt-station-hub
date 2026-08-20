// A ca that gained a bán nợ after it was chốt'd. Pure — the ca and the day's lượt xe
// in, a boolean out — so the danh sách xuất MISA and the ca's own page flag the same
// ca, and so does a test.
//
// The flag is derived, never stored: nothing records that a ca was exported, so a
// re-exported ca keeps showing it. That is honest — the flag describes the ca, not
// the file someone happens to be holding.
import { APPROVED_VISIT_STATUSES, shiftDayWindow } from '@/lib/misa-export/debts-list'

/** A ca as this check reads it: whether it was chốt'd, when, and for which ngày. */
export type ChotShift = {
  stationId: string
  /** UTC midnight labelled with the Vietnam calendar day, as `shifts.shift_date` stores it. */
  shiftDate: Date
  status: string
  completedAt: Date | null
}

/** A lượt xe as this check reads it — the four fields that decide whether it is late. */
export type ReviewedVisit = {
  stationId: string
  visitDate: Date
  reviewStatus: string
  reviewedAt: Date | null
}

/**
 * Whether this ca was chốt'd and some bán nợ of its ngày was duyệt'd afterwards — so
 * the MISA file the kế toán already downloaded no longer holds every credit line the
 * ca has.
 *
 * The trạm closes its ca around 15:00 and evening công nợ sends still belong to that
 * day, so a lượt xe duyệt'd at 19:00 joins a ca chốt'd at 15:30. That is correct — a
 * lượt xe is selected into a ca by its ngày, not attached to one — and it is the
 * silence that is wrong, not the debt.
 *
 * `visits` may be any pool; this narrows it to exactly what the Bán nợ trong ca list
 * and the MISA export select — đã duyệt and đã sửa, this trạm, this ngày — so the
 * flag cannot fire on a lượt xe that was never in the file. Late is strictly after:
 * a duyệt at the chốt instant is already in the file.
 */
export function hasLateDebtApproval(shift: ChotShift, visits: readonly ReviewedVisit[]): boolean {
  const chotAt = shift.completedAt
  if (shift.status !== 'completed' || chotAt === null) return false

  const { start, end } = shiftDayWindow(shift.shiftDate)
  return visits.some(
    (v) =>
      v.stationId === shift.stationId &&
      APPROVED_VISIT_STATUSES.includes(v.reviewStatus) &&
      v.visitDate >= start &&
      v.visitDate < end &&
      v.reviewedAt !== null &&
      v.reviewedAt > chotAt
  )
}

/** The ids of the ca in `shifts` that gained a bán nợ after chốt — for a list of ca. */
export function shiftIdsWithLateDebtApproval(
  shifts: readonly (ChotShift & { id: string })[],
  visits: readonly ReviewedVisit[]
): Set<string> {
  return new Set(shifts.filter((s) => hasLateDebtApproval(s, visits)).map((s) => s.id))
}

/**
 * The `visitDate` range covering every ca in a list — what bounds the one query that
 * feeds `shiftIdsWithLateDebtApproval`, so a page showing fifty ca reads fifty days of
 * lượt xe rather than every lượt xe ever recorded. Null when there is no ca to bound.
 */
export function visitDateSpan(
  shifts: readonly { shiftDate: Date }[]
): { start: Date; end: Date } | null {
  if (shifts.length === 0) return null
  const windows = shifts.map((s) => shiftDayWindow(s.shiftDate))
  return {
    start: new Date(Math.min(...windows.map((w) => w.start.getTime()))),
    end: new Date(Math.max(...windows.map((w) => w.end.getTime()))),
  }
}
