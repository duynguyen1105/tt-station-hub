import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { stationFuelRefusal } from '@/lib/fuels/load-catalogue'
import { Prisma } from '@/lib/generated/prisma/client'
import { isManualMovement, manualMovementDeltas } from '@/lib/inventory/manual-movement'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

const updateSchema = z
  .object({
    fuelType: z.string().min(1),
    movementType: z.enum(['import', 'sale', 'adjustment']),
    quantity: z.number(),
    movementDate: z.coerce.date(),
    note: z.string().nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0)

type Context = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Context) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()
  const { id } = await params
  const parsed = updateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  const old = await prisma.inventoryMovement.findUnique({ where: { id } })
  if (!old) return notFound()
  if (!(await canReachStation(user, old.stationId))) return forbidden()
  if (!isManualMovement(old)) return badRequest(vi.inventory.manualOnly)
  if (parsed.data.fuelType && parsed.data.fuelType !== old.fuelType) {
    const refusal = await stationFuelRefusal(old.stationId, parsed.data.fuelType)
    if (refusal) return badRequest(refusal)
  }

  const { before, updated } = await prisma.$transaction(
    async (tx) => {
      const before = await tx.inventoryMovement.findUniqueOrThrow({ where: { id } })
      const updated = await tx.inventoryMovement.update({ where: { id }, data: parsed.data })
      for (const [fuelType, delta] of manualMovementDeltas(before, updated)) {
        await tx.inventoryBalance.upsert({
          where: { stationId_fuelType: { stationId: before.stationId, fuelType } },
          update: { estimatedStock: { increment: delta } },
          create: { stationId: before.stationId, fuelType, estimatedStock: delta },
        })
      }
      return { before, updated }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  )
  await writeAudit({
    userId: user.id,
    action: 'inventory.movement.update',
    entity: 'inventory_movement',
    entityId: id,
    metadata: { from: before, to: updated },
  })
  return ok(updated)
}

export async function DELETE(_req: NextRequest, { params }: Context) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()
  const { id } = await params
  const old = await prisma.inventoryMovement.findUnique({ where: { id } })
  if (!old) return notFound()
  if (!(await canReachStation(user, old.stationId))) return forbidden()
  if (!isManualMovement(old)) return badRequest(vi.inventory.manualOnly)

  const before = await prisma.$transaction(
    async (tx) => {
      const before = await tx.inventoryMovement.findUniqueOrThrow({ where: { id } })
      await tx.inventoryMovement.delete({ where: { id } })
      for (const [fuelType, delta] of manualMovementDeltas(before, null)) {
        await tx.inventoryBalance.upsert({
          where: { stationId_fuelType: { stationId: before.stationId, fuelType } },
          update: { estimatedStock: { increment: delta } },
          create: { stationId: before.stationId, fuelType, estimatedStock: delta },
        })
      }
      return before
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  )
  await writeAudit({
    userId: user.id,
    action: 'inventory.movement.delete',
    entity: 'inventory_movement',
    entityId: id,
    metadata: { from: before, to: null },
  })
  return ok({ id })
}
