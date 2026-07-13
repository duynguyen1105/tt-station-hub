import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, created, forbidden, notFound, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { hasRole } from '@/lib/auth/permissions'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

const priceSchema = z.object({
  stationId: z.string().uuid(),
  fuelType: z.enum(['DO', 'E0', 'DC', 'XANG_A95', 'URE']),
  effectiveDate: z.coerce.date(),
  unitPrice: z.number().positive(),
})

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!hasRole(user.role, ['admin', 'accountant'])) return forbidden()

  const parsed = priceSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  const { stationId, fuelType, effectiveDate, unitPrice } = parsed.data

  const station = await prisma.station.findUnique({ where: { id: stationId } })
  if (!station) return notFound()

  const existing = await prisma.misaRetailPrice.findUnique({
    where: { stationId_fuelType_effectiveDate: { stationId, fuelType, effectiveDate } },
  })
  if (existing) return badRequest(vi.misaSettings.duplicate)

  const price = await prisma.misaRetailPrice.create({
    data: { stationId, fuelType, effectiveDate, unitPrice },
  })

  await writeAudit({
    userId: user.id,
    action: 'misa.retail_price.create',
    entity: 'misa_retail_price',
    entityId: price.id,
    metadata: parsed.data,
  })
  return created(price)
}
