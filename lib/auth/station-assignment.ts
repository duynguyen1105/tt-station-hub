/**
 * What changing a kế toán's phụ trách costs, worked out before anything is
 * written. A trạm has exactly one phụ trách, so a tick is never merely an
 * addition: it may be taking a trạm off somebody. This module names which trạm
 * are being released, which claimed, and which of the claims are handovers —
 * the same three lists the dialog shows the quản trị viên and the route writes
 * and audits, so what was seen and what happened cannot disagree.
 *
 * Pure, like `station-access.ts` beside it: the caller supplies the trạm rows, in
 * the same reduced shape that module already reads them in.
 */
import { type StationAccess } from '@/lib/auth/station-access'

export type StationAssignmentPlan = {
  /** Trạm this kế toán holds and will not after — left with no phụ trách. */
  released: string[]
  /** Trạm this kế toán will hold and does not now. */
  claimed: string[]
  /** The claims that are handovers, with the kế toán losing each trạm. */
  takenOver: { stationId: string; fromAccountantId: string }[]
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
  const plan: StationAssignmentPlan = { released: [], claimed: [], takenOver: [] }

  // Driven by the trạm rather than by the ticks, so each trạm is decided once
  // however many times it was ticked, and nothing outside the list is touched.
  for (const station of stations) {
    const held = station.assignedAccountantId === accountantId
    if (selected.has(station.id)) {
      if (held) continue
      plan.claimed.push(station.id)
      if (station.assignedAccountantId) {
        plan.takenOver.push({
          stationId: station.id,
          fromAccountantId: station.assignedAccountantId,
        })
      }
    } else if (held) {
      plan.released.push(station.id)
    }
  }

  return plan
}
