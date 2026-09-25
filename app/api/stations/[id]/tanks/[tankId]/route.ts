import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { hasRole } from '@/lib/auth/permissions'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { tankNameFor } from '@/lib/dispensers/naming'
import { stationFuelRefusal } from '@/lib/fuels/load-catalogue'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

/**
 * What Chỉnh sửa changes: the nhiên liệu the hầm holds and its dung tích. The số hầm is
 * not here — đo hầm and phiếu nhập already name the hầm by its code.
 */
const editSchema = z.strictObject({
  fuelType: z.string().trim().min(1),
  capacityK: z.number().int().min(1).max(1000).nullable(),
})

/**
 * Chỉnh sửa a hầm. A nhiên liệu change converts its linked trụ only when none of
 * them draw from another hầm, which would otherwise leave a trụ mixing fuels.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tankId: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!hasRole(user.role, ['admin', 'accountant'])) return forbidden()
  const { id: stationId, tankId } = await params

  const parsed = editSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  const { fuelType, capacityK } = parsed.data

  if (!(await canReachStation(user, stationId))) return forbidden()
  // Scoped to the trạm in the path, so a hầm id cannot be edited through a trạm the
  // person happens to be phụ trách of.
  const tank = await prisma.tank.findFirst({ where: { id: tankId, stationId } })
  if (!tank) return notFound()

  // A nhiên liệu left alone passes: a hầm may still hold one the trạm has since stopped
  // selling, and correcting its dung tích is not the moment to refuse it.
  const converted = fuelType !== tank.fuelType
  if (converted) {
    const notSold = await stationFuelRefusal(stationId, fuelType)
    if (notSold) return badRequest(notSold)
    const shared = await prisma.dispenser.findFirst({
      where: {
        AND: [
          { tankLinks: { some: { tankId } } },
          { tankLinks: { some: { tankId: { not: tankId } } } },
        ],
      },
      select: { displayName: true },
    })
    if (shared) return badRequest(vi.tanks.sharedFuelChange(shared.displayName))
  }

  const { updated, dispensersRewritten } = await prisma.$transaction(async (tx) => {
    const updated = await tx.tank.update({ where: { id: tankId }, data: { fuelType, capacityK } })
    const dispensersRewritten = converted
      ? (
          await tx.dispenser.updateMany({
            where: { tankLinks: { some: { tankId } } },
            data: { fuelType },
          })
        ).count
      : 0
    return { updated, dispensersRewritten }
  })

  await writeAudit({
    userId: user.id,
    action: converted ? 'tank.convert' : 'tank.update',
    entity: 'tank',
    entityId: tankId,
    metadata: {
      stationId,
      code: tank.code,
      from: { fuelType: tank.fuelType, capacityK: tank.capacityK },
      to: { fuelType, capacityK },
      dispensersRewritten,
    },
  })
  return ok(updated)
}

/**
 * Xóa a hầm no trụ draws from — one created by mistake. A hầm with trụ, retired ones
 * included, is refused. Đo hầm and phiếu nhập name the hầm by its code, not this row.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; tankId: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!hasRole(user.role, ['admin', 'accountant'])) return forbidden()
  const { id: stationId, tankId } = await params

  if (!(await canReachStation(user, stationId))) return forbidden()
  const tank = await prisma.tank.findFirst({ where: { id: tankId, stationId } })
  if (!tank) return notFound()

  const attached = await prisma.dispenser.findMany({
    where: { tankLinks: { some: { tankId } } },
    select: { displayName: true },
    orderBy: { displayOrder: 'asc' },
  })
  if (attached.length > 0) {
    return badRequest(
      vi.tanks.hasDispensers(tankNameFor(tank.code), attached.map((d) => d.displayName).join(', '))
    )
  }

  await prisma.tank.delete({ where: { id: tankId } })

  await writeAudit({
    userId: user.id,
    action: 'tank.delete',
    entity: 'tank',
    entityId: tankId,
    metadata: { stationId, code: tank.code, fuelType: tank.fuelType, capacityK: tank.capacityK },
  })
  return ok({ id: tankId })
}
