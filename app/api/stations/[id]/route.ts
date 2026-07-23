import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { hasRole } from '@/lib/auth/permissions'
import { getCurrentUser } from '@/lib/auth/session'
import { FuelArea } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'

const updateSchema = z.object({
  fuelArea: z.nativeEnum(FuelArea),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!hasRole(user.role, ['admin', 'accountant'])) return forbidden()
  const { id } = await params

  const parsed = updateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())

  const station = await prisma.station.findUnique({ where: { id } })
  if (!station) return notFound()

  const updated = await prisma.station.update({
    where: { id },
    data: { fuelArea: parsed.data.fuelArea },
  })

  await writeAudit({
    userId: user.id,
    action: 'station.update',
    entity: 'station',
    entityId: id,
    metadata: { from: station.fuelArea, to: parsed.data.fuelArea },
  })
  return ok(updated)
}
