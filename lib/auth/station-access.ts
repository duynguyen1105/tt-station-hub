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

/** A trạm, reduced to the kế toán phụ trách of it — any number, all equals. */
export type StationAccess = {
  id: string
  accountantIds: readonly string[]
}

/** A kế toán, reduced to whether their tài khoản still works. */
export type AccountantAccess = {
  id: string
  isActive: boolean
}

/**
 * Does this person read the whole company, whatever the trạm? A quản trị viên
 * and a người xem do. Asked on its own by a caller narrowing a query that has
 * no trạm to filter on — it can then leave the query it had alone rather than
 * enumerate every row a company-wide reader is entitled to.
 */
export function readsEveryStation(viewer: StationViewer): boolean {
  return viewer.role === 'admin' || viewer.role === 'viewer'
}

/**
 * May this person reach this trạm? A quản trị viên and a người xem read the
 * whole company; a kế toán reads exactly the trạm they are phụ trách of.
 */
export function canAccessStation(viewer: StationViewer, station: StationAccess): boolean {
  if (readsEveryStation(viewer)) return true
  return station.accountantIds.includes(viewer.id)
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
 * Is this trạm without a working kế toán? True when nobody is phụ trách of it,
 * and equally true when every kế toán on it has been suspended — suspension
 * keeps the assignment so that restoring is lossless, which would otherwise
 * leave the trạm looking covered while nobody can sign in to review it. One
 * active person covers it however many suspended ones sit beside them.
 *
 * A phụ trách who is not among the supplied kế toán at all — a profile that has
 * changed role or gone — counts for nothing here, for the same reason.
 */
export function isStationUncovered(
  station: StationAccess,
  accountants: readonly AccountantAccess[]
): boolean {
  return !station.accountantIds.some(
    (id) => accountants.find((a) => a.id === id)?.isActive === true
  )
}
