import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, created, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'

const movementSchema = z.object({
  stationId: z.string().uuid(),
  fuelType: z.string().min(1),
  movementType: z.enum(['import', 'sale', 'physical_count', 'adjustment']),
  quantity: z.number(), // signed: + import, - sale
  movementDate: z.coerce.date(),
  note: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const parsed = movementSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  const { stationId, fuelType, movementType, quantity, movementDate, note } = parsed.data

  const movement = await prisma.$transaction(async (tx) => {
    const row = await tx.inventoryMovement.create({
      data: { stationId, fuelType, movementType, quantity, movementDate, note, createdBy: user.id },
    })

    if (movementType === 'physical_count') {
      await tx.inventoryBalance.upsert({
        where: { stationId_fuelType: { stationId, fuelType } },
        update: { lastPhysicalStock: quantity, lastPhysicalAt: new Date() },
        create: {
          stationId,
          fuelType,
          estimatedStock: 0,
          lastPhysicalStock: quantity,
          lastPhysicalAt: new Date(),
        },
      })
    } else {
      await tx.inventoryBalance.upsert({
        where: { stationId_fuelType: { stationId, fuelType } },
        update: { estimatedStock: { increment: quantity } },
        create: { stationId, fuelType, estimatedStock: quantity },
      })
    }
    return row
  })

  await writeAudit({
    userId: user.id,
    action: 'inventory.movement',
    entity: 'inventory_movement',
    entityId: movement.id,
    metadata: parsed.data,
  })
  return created(movement)
}
