import { shiftDateFor } from '@/lib/photos/ingest'

/** One (trạm, ngày GMT+7) pairing that holds lượt xe công nợ. */
export type DebtDay = {
  stationId: string
  /** UTC midnight labelled with the Vietnam calendar day, as `shifts.shift_date` stores it. */
  shiftDate: Date
  /**
   * The thời điểm of the day's first lượt xe. The ca is created from this exact
   * timestamp — the one a photo would have handed in — so the day it lands on is
   * the day this lượt xe is read into, with no second reading of the GMT+7 rule.
   */
  firstVisitDate: Date
  visitCount: number
}

/** The two fields of a lượt xe that decide which ca it is read into. */
type DebtVisitDay = { stationId: string; visitDate: Date }

/** The key of a ca, as far as "does this day already have one?" is concerned. */
type ShiftDay = { stationId: string; shiftDate: Date }

function dayKey(stationId: string, shiftDate: Date): string {
  return `${stationId}|${shiftDate.toISOString()}`
}

/**
 * Splits the days that hold lượt xe công nợ into the ones still without a ca and
 * the ones that already have one. The day of a lượt xe is `shiftDateFor` — the
 * same GMT+7 rule photo intake keys a ca by — so a day this reports as missing is
 * exactly the day whose Bán nợ trong ca list would select those lượt xe.
 *
 * Both lists come back ordered by trạm id then ngày, so two runs over the same
 * data create the same ca in the same order.
 */
export function debtDaysMissingShift(
  visits: readonly DebtVisitDay[],
  shifts: readonly ShiftDay[]
): { missing: DebtDay[]; skipped: DebtDay[] } {
  const existing = new Set(shifts.map((s) => dayKey(s.stationId, s.shiftDate)))

  const days = new Map<string, DebtDay>()
  for (const visit of visits) {
    const shiftDate = shiftDateFor(visit.visitDate.getTime())
    const key = dayKey(visit.stationId, shiftDate)
    const day = days.get(key)
    if (!day) {
      days.set(key, {
        stationId: visit.stationId,
        shiftDate,
        firstVisitDate: visit.visitDate,
        visitCount: 1,
      })
      continue
    }
    day.visitCount++
    if (visit.visitDate < day.firstVisitDate) day.firstVisitDate = visit.visitDate
  }

  const ordered = [...days.values()].sort(
    (a, b) =>
      a.stationId.localeCompare(b.stationId) || a.shiftDate.getTime() - b.shiftDate.getTime()
  )

  const missing: DebtDay[] = []
  const skipped: DebtDay[] = []
  for (const day of ordered) {
    if (existing.has(dayKey(day.stationId, day.shiftDate))) skipped.push(day)
    else missing.push(day)
  }
  return { missing, skipped }
}
