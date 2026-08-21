import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import {
  type ShiftStatus,
  canCreateReading,
  canEditClosing,
  canEditOpening,
  isReadingDecided,
} from '@/lib/auth/reading-policy'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { prisma } from '@/lib/prisma'
import { applyReadingCorrection } from '@/lib/readings/apply-correction'

// Readings are stored as strings to preserve leading zeros (see lib/ai).
const readingSchema = z.object({
  openingElectronicReading: z.string().nullable().optional(),
  openingMechanicalReading: z.string().nullable().optional(),
  electronicReading: z.string().nullable().optional(),
  mechanicalReading: z.string().nullable().optional(),
})

/**
 * Writes a ca's reading addressed by its Trụ rather than by a reading id —
 * the only way to reach a Trụ no photo ever arrived for, which has no row for
 * the correction endpoints to key off. The first value saved creates the row;
 * from then on it is an ordinary reading and the row's own endpoints take over.
 *
 * The gates are per field, so this route can never be looser than the cells it
 * serves: an opening still asks `canEditOpening` (admin only), a closing
 * `canEditClosing`, and conjuring a reading no photo backs asks
 * `canCreateReading`. A row that already exists and has been duyệt/từ chối is
 * closed to every role, exactly as the correction endpoints close it. See
 * docs/adr/0001.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; dispenserId: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id, dispenserId } = await params

  const parsed = readingSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  const patch = parsed.data

  const shift = await prisma.shift.findUnique({ where: { id } })
  if (!shift) return notFound()
  // The ca's own trạm decides, as it does for every other write on a reading.
  if (!(await canReachStation(user, shift.stationId))) return forbidden()
  const status = shift.status as ShiftStatus

  // A Trụ of another trạm — or one since retired — is not addressable through
  // this ca, however the identifier was come by.
  const dispenser = await prisma.dispenser.findFirst({
    where: { id: dispenserId, stationId: shift.stationId, isActive: true },
  })
  if (!dispenser) return notFound()

  const touchesOpening =
    patch.openingElectronicReading !== undefined || patch.openingMechanicalReading !== undefined
  const touchesClosing =
    patch.electronicReading !== undefined || patch.mechanicalReading !== undefined
  if (touchesOpening && !canEditOpening(user.role)) return forbidden()
  if (touchesClosing && !canEditClosing(user.role, status)) return forbidden()

  const existing = await prisma.shiftReading.findUnique({
    where: { shiftId_dispenserId: { shiftId: id, dispenserId } },
  })
  if (!existing && !canCreateReading(user.role, status)) return forbidden()
  if (existing && isReadingDecided(existing.reviewStatus)) return forbidden()

  // Upsert rather than create: a photo for this Trụ may land between the lookup
  // above and the write, and the compound unique would otherwise collide.
  // The opening is snapshotted from the Trụ's last-reading cache exactly as
  // ingest does it, so a hand-made row starts where the prior ca left off.
  const reading = await prisma.shiftReading.upsert({
    where: { shiftId_dispenserId: { shiftId: id, dispenserId } },
    create: {
      shiftId: id,
      dispenserId,
      fuelType: dispenser.fuelType,
      openingElectronicReading: dispenser.lastElectronicReading,
      openingMechanicalReading: dispenser.lastMechanicalReading,
      reviewStatus: 'needs_review',
    },
    update: {},
  })

  const updated = await applyReadingCorrection({
    reading,
    dispenser,
    patch,
    userId: user.id,
    auditAction: 'reading.manual_entry',
    auditMetadata: { dispenserId, created: existing === null, patch },
  })
  return ok(updated)
}
