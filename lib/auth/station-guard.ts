import { cache } from 'react'

import { notFound, redirect } from 'next/navigation'

import { type CurrentUser, requireUser } from '@/lib/auth/session'
import {
  type StationAccess,
  type StationViewer,
  accessibleStationIds,
  canAccessStation,
  readsEveryStation,
} from '@/lib/auth/station-access'
import { prisma } from '@/lib/prisma'

/**
 * The thin caller around `station-access.ts` — the one database read that
 * module refuses to do itself, so the rule about who may reach which trạm stays
 * pure data-in, decision-out and every screen and endpoint asks it the same way.
 *
 * Two reads rather than a join, because the schema keeps foreign keys as plain
 * columns and declares no relations.
 *
 * Wrapped in React `cache()` so a trạm's layout and the tab rendering inside it
 * share one lookup per request, the way `getCurrentUser` already does for the
 * profile.
 */
const loadStationAccess = cache(async (stationId: string): Promise<StationAccess | null> => {
  const [station, rows] = await Promise.all([
    prisma.station.findUnique({ where: { id: stationId }, select: { id: true } }),
    prisma.stationAccountant.findMany({ where: { stationId }, select: { accountantId: true } }),
  ])
  if (!station) return null
  return { id: station.id, accountantIds: rows.map((row) => row.accountantId) }
})

/**
 * Every trạm with the kế toán phụ trách of it, open or closed — the whole table
 * in the reduced shape the rule reads, since the two callers below want
 * different halves of it and neither wants a second round trip for the other's.
 */
const loadEveryStationAccess = cache(
  async (): Promise<(StationAccess & { isActive: boolean })[]> => {
    const [stations, rows] = await Promise.all([
      prisma.station.findMany({ select: { id: true, isActive: true } }),
      prisma.stationAccountant.findMany({ select: { stationId: true, accountantId: true } }),
    ])
    const byStation = new Map<string, string[]>()
    for (const row of rows) {
      const ids = byStation.get(row.stationId) ?? []
      ids.push(row.accountantId)
      byStation.set(row.stationId, ids)
    }
    return stations.map((station) => ({
      id: station.id,
      isActive: station.isActive,
      accountantIds: byStation.get(station.id) ?? [],
    }))
  }
)

/**
 * The active trạm and who is on each — what the kế toán screen draws its
 * checklist from and what the two kế toán routes work their assignment plan
 * out against. Closed trạm are left out: one needs no kế toán, and one somebody
 * is on stays that way rather than being released behind their back.
 */
export async function activeStationAccess(): Promise<StationAccess[]> {
  return (await loadEveryStationAccess()).filter((station) => station.isActive)
}

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
  return accessibleStationIds(viewer, await loadEveryStationAccess())
}

/**
 * Every ca this person may reach, or `null` for someone who may reach them all
 * — what the Ca review queue narrows its query to. A số liệu carries no trạm of
 * its own, only the ca it belongs to, so the boundary has to be spelled out as
 * identifiers before the queue is read; filtering afterwards would let another
 * trạm's backlog crowd a kế toán's own work out of the page.
 *
 * `null` rather than every identifier in the table: a quản trị viên keeps the
 * query they had instead of carrying the whole ca history through an `in`.
 */
export async function reachableShiftIds(viewer: StationViewer): Promise<string[] | null> {
  if (readsEveryStation(viewer)) return null
  const stationIds = await reachableStationIds(viewer)
  const shifts = await prisma.shift.findMany({
    where: { stationId: { in: stationIds } },
    select: { id: true },
  })
  return shifts.map((shift) => shift.id)
}
