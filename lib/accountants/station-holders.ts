import { activeStationAccess } from '@/lib/auth/station-guard'
import { prisma } from '@/lib/prisma'

/** An active trạm and the kế toán phụ trách of it — any number of them, all equals. */
export type StationWithHolders = {
  id: string
  name: string
  heldBy: { id: string; fullName: string }[]
}

/**
 * Every active trạm with the people on it named — what both kế toán screens ask
 * for: the list, to say what each person is phụ trách of, and the checklist, to
 * say whose name a tick would add this person beside.
 *
 * Closed trạm are left out, as everywhere else a trạm list is read: a closed
 * trạm needs no kế toán, so it belongs in neither the checklist nor the coverage
 * count. The order is by mã trạm, which is the order the checklist shows.
 *
 * Who is on each of them is read through the same module every other screen
 * asks, so these two cannot answer differently from the boundary itself.
 */
export async function activeStationsWithHolders(): Promise<StationWithHolders[]> {
  const [profiles, stations, access] = await Promise.all([
    // Every profile, not only the kế toán: whoever is already on a trạm has to be
    // named, and which role they hold is not this list's business.
    prisma.profile.findMany({ select: { id: true, fullName: true } }),
    prisma.station.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { code: 'asc' },
    }),
    activeStationAccess(),
  ])

  const accountantIdsByStation = new Map(
    access.map((station) => [station.id, station.accountantIds])
  )
  return stations.map((station) => ({
    id: station.id,
    name: station.name,
    heldBy: (accountantIdsByStation.get(station.id) ?? []).flatMap((holderId) => {
      const holder = profiles.find((profile) => profile.id === holderId)
      return holder ? [{ id: holder.id, fullName: holder.fullName }] : []
    }),
  }))
}
