import { cache } from 'react'

import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

/**
 * Every hầm one trạm has: its Cấu hình rows and any codes preserved on older
 * đo hầm. Linked trụ cannot add codes because every link points to a Tank row.
 * Cached per request for the picker and route validation.
 */
export const loadStationTankCodes = cache(async (stationId: string): Promise<string[]> => {
  const [tanks, dips] = await Promise.all([
    prisma.tank.findMany({ where: { stationId }, select: { code: true } }),
    prisma.tankDipRecord.findMany({
      where: { stationId },
      select: { tankCode: true },
      distinct: ['tankCode'],
    }),
  ])
  const codes = new Set([...tanks.map((tank) => tank.code), ...dips.map((dip) => dip.tankCode)])
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
