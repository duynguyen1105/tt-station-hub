import { type NextRequest } from 'next/server'

import { ok, unauthorized } from '@/lib/api/response'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const stationId = req.nextUrl.searchParams.get('stationId')

  const balances = await prisma.inventoryBalance.findMany({
    where: stationId ? { stationId } : undefined,
    orderBy: { fuelType: 'asc' },
  })
  return ok(balances)
}
