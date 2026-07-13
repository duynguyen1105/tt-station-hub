import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { hasRole } from '@/lib/auth/permissions'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'

const code = z.string().trim().min(1)

const configSchema = z.object({
  stationId: z.string().uuid(),
  revenueAccount: code,
  costAccount: code,
  stockAccount: code,
  creditDebitAccount: code,
  cashDebitAccount: code,
})

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!hasRole(user.role, ['admin', 'accountant'])) return forbidden()

  const parsed = configSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  const { stationId, ...values } = parsed.data

  const station = await prisma.station.findUnique({ where: { id: stationId } })
  if (!station) return notFound()

  const config = await prisma.misaStationConfig.upsert({
    where: { stationId },
    update: values,
    create: { stationId, ...values },
  })

  await writeAudit({
    userId: user.id,
    action: 'misa.station_config.upsert',
    entity: 'misa_station_config',
    entityId: config.id,
    metadata: parsed.data,
  })
  return ok(config)
}
