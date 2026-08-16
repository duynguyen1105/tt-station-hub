/**
 * What changing a kế toán's phụ trách costs, worked out before anything is
 * written. A trạm has any number of phụ trách, so a tick is purely this person
 * joining it and an untick purely this person leaving it — neither touches
 * anybody else's membership. This module names which trạm are being released
 * and which claimed — the same two lists the dialog shows the quản trị viên and
 * the route writes and audits, so what was seen and what happened cannot
 * disagree.
 *
 * Pure, like `station-access.ts` beside it: the caller supplies the trạm rows, in
 * the same reduced shape that module already reads them in.
 */
import { type StationAccess } from '@/lib/auth/station-access'

export type StationAssignmentPlan = {
  /** Trạm this kế toán is on and will not be after — whoever else stays. */
  released: string[]
  /** Trạm this kế toán will be on and is not now — taken off nobody. */
  claimed: string[]
}

/**
 * The writes that turn today's phụ trách into `selectedStationIds` for this kế
 * toán. Only the supplied trạm are considered — a ticked identifier that is not
 * among them (a closed trạm, or one invented by a caller) is ignored rather
 * than written.
 */
export function planStationAssignment(
  accountantId: string,
  stations: readonly StationAccess[],
  selectedStationIds: readonly string[]
): StationAssignmentPlan {
  const selected = new Set(selectedStationIds)
  const plan: StationAssignmentPlan = { released: [], claimed: [] }

  // Driven by the trạm rather than by the ticks, so each trạm is decided once
  // however many times it was ticked, and nothing outside the list is touched.
  for (const station of stations) {
    const alreadyOn = station.accountantIds.includes(accountantId)
    if (selected.has(station.id)) {
      if (!alreadyOn) plan.claimed.push(station.id)
    } else if (alreadyOn) {
      plan.released.push(station.id)
    }
  }

  return plan
}
