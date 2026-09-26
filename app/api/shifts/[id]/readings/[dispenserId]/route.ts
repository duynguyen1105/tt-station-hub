import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import {
  type ShiftStatus,
  canCreateReading,
  canEditClosing,
  canEditOpening,
  isReadingFrozen,
} from '@/lib/auth/reading-policy'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { prisma } from '@/lib/prisma'
import { applyReadingCorrection } from '@/lib/readings/apply-correction'
import { openingReadingsFor, shiftLockRefusal } from '@/lib/shifts/opening-reading'

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
 * A completed ca is locked for everyone, even when editing an opening or
 * creating a reading. On a decided row only admin may repair its values.
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
  if (status === 'completed') return forbidden()

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
  if (existing && isReadingFrozen(user.role, existing.reviewStatus)) return forbidden()

  // The row is created inside the correction's ca-locked transaction, so a Chốt ca
  // that lands first refuses the entry rather than leaving an empty chờ duyệt row on
  // a chốt'd ca. The opening is snapshotted exactly as ingest does it — the Trụ's
  // latest duyệt'd closing from an earlier ngày, else its cache — so a hand-made row
  // starts where the prior ca left off. Upsert, not create: a row that appeared since
  // the lookup is simply the one corrected.
  const key = { shiftId_dispenserId: { shiftId: id, dispenserId } }
  const updated = await applyReadingCorrection({
    shiftId: id,
    load: async (db) => {
      const current = await db.shiftReading.findUnique({ where: key })
      if (current) return current
      const opening = await openingReadingsFor(dispenserId, shift.shiftDate, db)
      return db.shiftReading.upsert({
        where: key,
        create: {
          shiftId: id,
          dispenserId,
          fuelType: dispenser.fuelType,
          openingElectronicReading: opening.electronic,
          openingMechanicalReading: opening.mechanical,
          reviewStatus: 'needs_review',
        },
        update: {},
      })
    },
    role: user.role,
    dispenser,
    patch,
    userId: user.id,
    auditAction: 'reading.manual_entry',
    auditMetadata: { dispenserId, created: existing === null, patch },
  }).catch(shiftLockRefusal)
  if (updated instanceof Response) return updated
  return ok(updated)
}
