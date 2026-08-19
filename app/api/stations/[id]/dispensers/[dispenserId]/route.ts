import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { hasRole } from '@/lib/auth/permissions'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { refuseDispenserShape, tankFieldsFor } from '@/lib/dispensers/rules'
import { stationFuelRefusal } from '@/lib/fuels/load-catalogue'
import { prisma } from '@/lib/prisma'

/**
 * What Chỉnh sửa changes: the nhiên liệu the trụ pumps, the hầm it draws from, its dung
 * tích and the đồng hồ it carries. The số trụ is not here — it is the code a photo
 * matches a biển to, and it is fixed once the trụ is lắp.
 */
const editSchema = z.strictObject({
  fuelType: z.string().trim().min(1),
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
 * Changing the nhiên liệu converts the trụ from here on: the chỉ số of every ca already
 * chốt carry their own nhiên liệu, so what the trụ sold as a trụ DO still reads DO on
 * screen and re-exports as DO. Tồn kho is not migrated — the hầm is emptied and refilled
 * in the real world, and that is recorded as kho movements.
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

  const { fuelType, tankNumber, tankCapacityK, ...meters } = parsed.data
  const refusal = refuseDispenserShape(parsed.data)
  if (refusal) return badRequest(refusal)

  // A trụ converted from DO to DC pumps DC from every ca after this one; each chỉ số it
  // has already written keeps the nhiên liệu stamped on it, so nothing behind it moves.
  // A nhiên liệu left alone passes untouched: a trụ đã ngừng may still hold one the trạm
  // has since stopped selling, and editing its hầm is not the moment to refuse it.
  const converted = fuelType !== dispenser.fuelType
  if (converted) {
    const notSold = await stationFuelRefusal(stationId, fuelType)
    if (notSold) return badRequest(notSold)
  }

  const tankFields = tankFieldsFor(tankNumber, tankCapacityK)
  const updated = await prisma.dispenser.update({
    where: { id: dispenserId },
    data: { fuelType, ...tankFields, ...meters },
  })

  await writeAudit({
    userId: user.id,
    // A conversion is a physical event — the hầm is emptied and refilled — and someone
    // will want to date it later, so it is its own action rather than one more field
    // buried in an edit.
    action: converted ? 'dispenser.convert' : 'dispenser.update',
    entity: 'dispenser',
    entityId: dispenserId,
    metadata: {
      stationId,
      code: dispenser.code,
      from: {
        fuelType: dispenser.fuelType,
        tankCode: dispenser.tankCode,
        tankCapacityK: dispenser.tankCapacityK,
        hasElectronicMeter: dispenser.hasElectronicMeter,
        hasMechanicalMeter: dispenser.hasMechanicalMeter,
      },
      to: { fuelType, ...tankFields, ...meters },
    },
  })
  return ok(updated)
}
