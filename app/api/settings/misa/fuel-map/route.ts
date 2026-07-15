import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { hasRole } from '@/lib/auth/permissions'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'

const fuelMapSchema = z.object({
  stationId: z.string().uuid(),
  fuelType: z.enum(['DO', 'E0', 'DC', 'XANG_A95', 'URE']),
  productCode: z.string().trim().min(1),
  productName: z.string().trim().min(1).nullable().optional(),
  warehouseCode: z.string().trim().min(1),
  unit: z.string().trim().min(1).nullable().optional(),
})

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!hasRole(user.role, ['admin', 'accountant'])) return forbidden()

  const parsed = fuelMapSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  const { stationId, fuelType, productCode, productName, warehouseCode, unit } = parsed.data

  const station = await prisma.station.findUnique({ where: { id: stationId } })
  if (!station) return notFound()

  const entry = await prisma.misaFuelMap.upsert({
    where: { stationId_fuelType: { stationId, fuelType } },
    update: { productCode, productName: productName ?? null, warehouseCode, unit: unit ?? null },
    create: {
      stationId,
      fuelType,
      productCode,
      productName: productName ?? null,
      warehouseCode,
      unit: unit ?? null,
    },
  })

  await writeAudit({
    userId: user.id,
    action: 'misa.fuel_map.upsert',
    entity: 'misa_fuel_map',
    entityId: entry.id,
    metadata: parsed.data,
  })
  return ok(entry)
}
