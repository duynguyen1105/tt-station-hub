import { type NextRequest } from 'next/server'

import { forbidden, ok, unauthorized } from '@/lib/api/response'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation, reachableStationIds } from '@/lib/auth/station-guard'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const stationId = req.nextUrl.searchParams.get('stationId')
  if (stationId && !(await canReachStation(user, stationId))) return forbidden()

  const balances = await prisma.inventoryBalance.findMany({
    where: { stationId: stationId ?? { in: await reachableStationIds(user) } },
    orderBy: { fuelType: 'asc' },
  })
  return ok(balances)
}
