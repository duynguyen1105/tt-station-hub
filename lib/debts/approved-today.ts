import type { Prisma } from '@/lib/generated/prisma/client'
import { APPROVED_VISIT_STATUSES, shiftDayWindow } from '@/lib/misa-export/debts-list'
import { shiftDateFor } from '@/lib/photos/ingest'

/**
 * The `findMany` args that select what a kế toán's trạm duyệt'd today: an
 * approved/corrected lượt xe whose `reviewedAt` falls in the GMT+7 day `now` is in.
 *
 * Membership is by thời điểm duyệt, not by ngày bán — a lượt xe of yesterday duyệt'd
 * this morning belongs here, and is the row a kế toán is least likely to find any
 * other way. The statuses are the ca's own (`APPROVED_VISIT_STATUSES`), so this list
 * and the ca's Bán nợ trong ca list never disagree about what counts as duyệt'd.
 *
 * Newest duyệt first: the card that just left the hàng đợi lands at the top.
 */
export function approvedTodaySelection(
  stationIds: string[],
  now: Date
): Prisma.DebtVehicleVisitFindManyArgs {
  const { start, end } = shiftDayWindow(shiftDateFor(now.getTime()))
  return {
    where: {
      stationId: { in: stationIds },
      reviewStatus: { in: APPROVED_VISIT_STATUSES },
      reviewedAt: { gte: start, lt: end },
    },
    orderBy: [{ reviewedAt: 'desc' }, { id: 'asc' }],
  }
}

/** One duyệt'd lượt xe as the list consumes it (a projection of DebtVehicleVisit). */
export type ApprovedVisitInput = {
  id: string
  stationId: string
  visitDate: Date
  reviewedAt: Date
  plateRead: string | null
  plateConfirmed: string | null
  litersRead: number | null
  customerId: string | null
}

/** A ca a lượt xe can be read into: one full-day ca per (trạm, ngày). */
export type ShiftDayInput = {
  id: string
  stationId: string
  /** UTC midnight labelled with the Vietnam calendar day, as `shifts.shift_date` stores it. */
  shiftDate: Date
}

/** One row of the "Đã duyệt hôm nay" list. */
export type ApprovedTodayRow = {
  visitId: string
  stationId: string
  visitDate: Date
  /** The truck plate, empty when neither read nor confirmed. */
  plate: string
  liters: number | null
  /** The khách hàng's name, empty when the lượt xe has none. */
  customerName: string
  /** The ca the lượt xe now belongs to; null when its ngày has none, and the row shows unlinked. */
  shiftId: string | null
}

function dayKey(stationId: string, shiftDate: Date): string {
  return `${stationId}|${shiftDate.toISOString()}`
}

/**
 * Build the read-only "Đã duyệt hôm nay" list: where each lượt xe the kế toán just
 * duyệt'd went. Pure — the caller selects the visits (`approvedTodaySelection`), the
 * ca of the ngày those visits fall on, and their khách hàng names.
 *
 * A lượt xe is read into its ca by `shiftDateFor(visitDate)` — the same GMT+7 rule
 * the ca's own Bán nợ trong ca list selects by, so the row links to the ca that
 * actually lists it. Rows come back newest duyệt first.
 */
export function buildApprovedTodayList(
  visits: readonly ApprovedVisitInput[],
  shifts: readonly ShiftDayInput[],
  customerNamesById: Map<string, string>
): ApprovedTodayRow[] {
  const shiftByDay = new Map(shifts.map((s) => [dayKey(s.stationId, s.shiftDate), s.id]))
  return [...visits]
    .sort((a, b) => b.reviewedAt.getTime() - a.reviewedAt.getTime())
    .map((v) => ({
      visitId: v.id,
      stationId: v.stationId,
      visitDate: v.visitDate,
      plate: v.plateConfirmed ?? v.plateRead ?? '',
      liters: v.litersRead,
      customerName: (v.customerId !== null ? customerNamesById.get(v.customerId) : undefined) ?? '',
      shiftId: shiftByDay.get(dayKey(v.stationId, shiftDateFor(v.visitDate.getTime()))) ?? null,
    }))
}
