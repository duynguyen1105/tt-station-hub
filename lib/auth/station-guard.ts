import { cache } from 'react'

import { notFound, redirect } from 'next/navigation'

import { type CurrentUser, requireUser } from '@/lib/auth/session'
import {
  type StationViewer,
  accessibleStationIds,
  canAccessStation,
} from '@/lib/auth/station-access'
import { prisma } from '@/lib/prisma'

/**
 * The thin caller around `station-access.ts` — the one database read that
 * module refuses to do itself, so the rule about who may reach which trạm stays
 * pure data-in, decision-out and every screen and endpoint asks it the same way.
 *
 * Wrapped in React `cache()` so a trạm's layout and the tab rendering inside it
 * share one lookup per request, the way `getCurrentUser` already does for the
 * profile.
 */
const loadStationAccess = cache(async (stationId: string) =>
  prisma.station.findUnique({
    where: { id: stationId },
    select: { id: true, assignedAccountantId: true },
  })
)

/**
 * Gates a trạm page. A kế toán reaching a trạm they are not phụ trách of — by a
 * stale link, a bookmark, or typing the address — is sent back to their own trạm
 * list rather than to an error page, so they can carry on working. A trạm that
 * does not exist is still a 404, as it was before the boundary.
 */
export async function requireStationAccess(stationId: string): Promise<CurrentUser> {
  const user = await requireUser()
  const station = await loadStationAccess(stationId)
  if (!station) notFound()
  if (!canAccessStation(user, station)) redirect('/stations')
  return user
}

/**
 * The same question asked by a route handler, which answers with a status
 * rather than a redirect. An identifier naming no trạm answers false as well —
 * a handler that owes its caller a 404 or a "Trạm không hợp lệ." says so from
 * its own lookup, and asks this about the row it found.
 */
export async function canReachStation(viewer: StationViewer, stationId: string): Promise<boolean> {
  const station = await loadStationAccess(stationId)
  return station !== null && canAccessStation(viewer, station)
}

/**
 * Every trạm this person may reach — what an endpoint answering about all of
 * them at once narrows its query to. A kế toán phụ trách of none gets an empty
 * list, and so an empty answer.
 *
 * Closed trạm are included deliberately: a quản trị viên asking one of these
 * endpoints keeps the whole answer they had before the boundary, and a kế toán
 * keeps the history of a trạm that has since shut.
 */
export async function reachableStationIds(viewer: StationViewer): Promise<string[]> {
  const stations = await prisma.station.findMany({
    select: { id: true, assignedAccountantId: true },
  })
  return accessibleStationIds(viewer, stations)
}
