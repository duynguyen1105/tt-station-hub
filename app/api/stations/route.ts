import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, created, forbidden, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { reachableStationIds } from '@/lib/auth/station-guard'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  // A kế toán is answered with the trạm they are phụ trách of, and nothing else.
  const reachable = new Set(await reachableStationIds(user))
  const stations = await prisma.station.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
  })
  return ok(stations.filter((station) => reachable.has(station.id)))
}

const createStationSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  branch: z.string().optional(),
  address: z.string().optional(),
  zaloGroupId: z.string().optional(),
  zaloDebtGroupId: z.string().optional(),
  // No kế toán: phụ trách is settled on the Kế toán screen, which is the one
  // write path into the join table and the one place it is audited.
})

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()

  const parsed = createStationSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())

  const station = await prisma.station.create({ data: parsed.data })
  await writeAudit({
    userId: user.id,
    action: 'station.create',
    entity: 'station',
    entityId: station.id,
    metadata: parsed.data,
  })
  return created(station)
}
