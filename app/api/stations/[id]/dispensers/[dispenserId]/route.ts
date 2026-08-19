import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { hasRole } from '@/lib/auth/permissions'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { refuseDispenserShape, tankFieldsFor } from '@/lib/dispensers/rules'
import { prisma } from '@/lib/prisma'

/**
 * What Chỉnh sửa changes: the hầm the trụ draws from, its dung tích and the đồng hồ it
 * carries. Neither the số trụ nor the nhiên liệu is here — both are stamped on chỉ số
 * already written, and ticket 13 is what opens the nhiên liệu.
 */
const editSchema = z.strictObject({
  tankNumber: z.number().int().min(1).max(99).nullable(),
  tankCapacityK: z.number().int().min(1).max(1000).nullable(),
  hasElectronicMeter: z.boolean(),
  hasMechanicalMeter: z.boolean(),
})

/** Ngừng sử dụng and Dùng lại — a trụ is retired, never deleted. */
const standingSchema = z.strictObject({ isActive: z.boolean() })

// Disjoint by construction, and strict on both sides: neither payload carries the
// other's required keys, and one carrying both is refused rather than half-applied —
// which is what a lenient object would do, silently stripping the keys it did not ask
// for. So the union picks the operation without a discriminator field on the wire.
const patchSchema = z.union([standingSchema, editSchema])

/**
 * Chỉnh sửa a trụ, or retire and restore one.
 *
 * Retiring deactivates rather than deletes: the chỉ số and the đồng hồ cache hanging
 * off the row are the trạm's history, and a ca that has already been chốt reads them.
 * What deactivating buys is that the ca stops expecting the trụ and every ô chọn stops
 * offering it — both of which read `isActive` already.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; dispenserId: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!hasRole(user.role, ['admin', 'accountant'])) return forbidden()
  const { id: stationId, dispenserId } = await params

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())

  if (!(await canReachStation(user, stationId))) return forbidden()
  // Scoped to the trạm in the path, so a trụ id cannot be edited through a trạm the
  // person happens to be phụ trách of.
  const dispenser = await prisma.dispenser.findFirst({ where: { id: dispenserId, stationId } })
  if (!dispenser) return notFound()

  if ('isActive' in parsed.data) {
    const { isActive } = parsed.data
    const updated = await prisma.dispenser.update({
      where: { id: dispenserId },
      data: { isActive },
    })
    await writeAudit({
      userId: user.id,
      action: isActive ? 'dispenser.reactivate' : 'dispenser.deactivate',
      entity: 'dispenser',
      entityId: dispenserId,
      metadata: { stationId, code: dispenser.code },
    })
    return ok(updated)
  }

  const { tankNumber, tankCapacityK, ...meters } = parsed.data
  const refusal = refuseDispenserShape(parsed.data)
  if (refusal) return badRequest(refusal)

  const tankFields = tankFieldsFor(tankNumber, tankCapacityK)
  const updated = await prisma.dispenser.update({
    where: { id: dispenserId },
    data: { ...tankFields, ...meters },
  })

  await writeAudit({
    userId: user.id,
    action: 'dispenser.update',
    entity: 'dispenser',
    entityId: dispenserId,
    metadata: {
      stationId,
      code: dispenser.code,
      from: {
        tankCode: dispenser.tankCode,
        tankCapacityK: dispenser.tankCapacityK,
        hasElectronicMeter: dispenser.hasElectronicMeter,
        hasMechanicalMeter: dispenser.hasMechanicalMeter,
      },
      to: { ...tankFields, ...meters },
    },
  })
  return ok(updated)
}
