import { type AppRole } from '@/lib/auth/permissions'

/**
 * The pure source of truth for which trạm a person may reach, and for which
 * trạm nobody is currently looking after. Pure predicates over the domain
 * vocabulary — role and the trạm's phụ trách — shared by the server pages, the
 * route handlers and the client so they cannot disagree.
 *
 * It reads nothing: callers supply the trạm rows and, for coverage, the kế toán
 * rows. Beside `reading-policy.ts`, which asks the same question of a ca.
 */

/** The person asking, reduced to what the rule needs. */
export type StationViewer = {
  id: string
  role: AppRole
}

/** A trạm, reduced to who is phụ trách of it. */
export type StationAccess = {
  id: string
  assignedAccountantId: string | null
}

/** A kế toán, reduced to whether their tài khoản still works. */
export type AccountantAccess = {
  id: string
  isActive: boolean
}

/**
 * May this person reach this trạm? A quản trị viên and a người xem read the
 * whole company; a kế toán reads exactly the trạm they are phụ trách of.
 */
export function canAccessStation(viewer: StationViewer, station: StationAccess): boolean {
  if (viewer.role === 'admin' || viewer.role === 'viewer') return true
  return station.assignedAccountantId === viewer.id
}

/**
 * The identifiers, out of the supplied trạm, this person may reach — the whole
 * list for a quản trị viên or a người xem, and possibly none for a kế toán.
 */
export function accessibleStationIds(
  viewer: StationViewer,
  stations: readonly StationAccess[]
): string[] {
  return stations
    .filter((station) => canAccessStation(viewer, station))
    .map((station) => station.id)
}

/**
 * Is this trạm without a working kế toán? True when it has no phụ trách at all,
 * and equally true when its phụ trách has been suspended — suspension keeps the
 * assignment so that restoring is lossless, which would otherwise leave the trạm
 * looking covered while nobody can sign in to review it.
 *
 * A phụ trách who is not among the supplied kế toán at all — a profile that has
 * changed role or gone — counts as uncovered for the same reason.
 */
export function isStationUncovered(
  station: StationAccess,
  accountants: readonly AccountantAccess[]
): boolean {
  if (!station.assignedAccountantId) return true
  const assignee = accountants.find((a) => a.id === station.assignedAccountantId)
  return !assignee?.isActive
}
