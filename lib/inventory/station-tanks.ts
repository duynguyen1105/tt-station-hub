import { cache } from 'react'

import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

/**
 * Every hầm one trạm has — the trụ that draw from one, plus the hầm seen only
 * through their đo hầm (a hầm dự phòng carries no trụ). The same two sources
 * `buildTankOptions` builds the ô chọn from, so what a route accepts and what a
 * picker offers cannot drift apart.
 *
 * There is no Hầm table: a hầm is only ever the `tankCode` string repeated on the
 * rows that mention it.
 *
 * Cached per request, so a route that both validates a write and re-derives from
 * the same list pays for one pair of queries.
 */
export const loadStationTankCodes = cache(async (stationId: string): Promise<string[]> => {
  const [dispensers, dips] = await Promise.all([
    prisma.dispenser.findMany({
      where: { stationId, isActive: true, tankCode: { not: null } },
      select: { tankCode: true },
      distinct: ['tankCode'],
    }),
    prisma.tankDipRecord.findMany({
      where: { stationId },
      select: { tankCode: true },
      distinct: ['tankCode'],
    }),
  ])
  const codes = new Set(dips.map((dip) => dip.tankCode))
  for (const d of dispensers) if (d.tankCode) codes.add(d.tankCode)
  return [...codes].sort()
})

/**
 * The refusal a route gives for a hầm this trạm does not have, or null when it
 * does — the server-side half of the narrowing, so a payload naming a hầm no ô
 * chọn offered is turned away rather than written. The twin of
 * `stationFuelRefusal` for the other half of a hầm plate.
 */
export async function stationTankRefusal(
  stationId: string,
  tankCode: string
): Promise<string | null> {
  const codes = await loadStationTankCodes(stationId)
  return codes.includes(tankCode) ? null : vi.inventory.notStationTank(tankCode)
}

/**
 * Whether a hầm holds stock no trụ draws on. Derived, never configured — the same
 * question `ingestTankDip` asks when it first records a đo hầm, asked again when a
 * correction moves that dip to a different hầm, because the answer belongs to the
 * hầm and not to the reading.
 */
export async function tankIsReserve(stationId: string, tankCode: string): Promise<boolean> {
  const attached = await prisma.dispenser.count({
    where: { stationId, tankCode, isActive: true },
  })
  return attached === 0
}
