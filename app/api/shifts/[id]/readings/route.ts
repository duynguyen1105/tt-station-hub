import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, created, forbidden, notFound, unauthorized } from '@/lib/api/response'
import { type ShiftStatus, canEditClosing, canEditOpening } from '@/lib/auth/reading-policy'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'
import { applyReadingCorrection } from '@/lib/readings/apply-correction'

// Readings are stored as strings to preserve leading zeros (see lib/ai).
const bodySchema = z.object({
  dispenserId: z.string().uuid(),
  openingElectronicReading: z.string().nullable().optional(),
  electronicReading: z.string().nullable().optional(),
  openingMechanicalReading: z.string().nullable().optional(),
  mechanicalReading: z.string().nullable().optional(),
})

/**
 * Manual entry for a pump WITHOUT a reading yet — a trụ whose photo never
 * arrived (URE_2, a missed shot) previously could not be filled by anyone,
 * because every correction endpoint needs an existing reading row. This one
 * creates the row (racing photos settle via the shift+dispenser unique key)
 * and then applies the typed values through the same correction tail, so the
 * review state, original-value preservation and audit match a normal repair.
 * Field gates follow ADR 0001: openings admin-only, closings admin/accountant
 * until chốt.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  const { dispenserId, ...patch } = parsed.data

  const touchesOpening =
    patch.openingElectronicReading !== undefined || patch.openingMechanicalReading !== undefined
  const touchesClosing =
    patch.electronicReading !== undefined || patch.mechanicalReading !== undefined
  if (!touchesOpening && !touchesClosing) return badRequest()

  const shift = await prisma.shift.findUnique({ where: { id } })
  if (!shift) return notFound()
  if (touchesOpening && !canEditOpening(user.role)) return forbidden()
  if (touchesClosing && !canEditClosing(user.role, shift.status as ShiftStatus)) {
    return forbidden()
  }

  const dispenser = await prisma.dispenser.findFirst({
    where: { id: dispenserId, stationId: shift.stationId, isActive: true },
  })
  if (!dispenser) return notFound()

  // Take the row if it exists (a photo may have landed since the page loaded);
  // otherwise create the empty shell. The unique key settles the race: the
  // loser of a concurrent create reads back the winner's row and corrects it.
  let reading = await prisma.shiftReading.findUnique({
    where: { shiftId_dispenserId: { shiftId: id, dispenserId } },
  })
  if (!reading) {
    try {
      reading = await prisma.shiftReading.create({
        data: { shiftId: id, dispenserId, reviewStatus: 'pending' },
      })
    } catch {
      reading = await prisma.shiftReading.findUnique({
        where: { shiftId_dispenserId: { shiftId: id, dispenserId } },
      })
    }
  }
  if (!reading) return badRequest()

  const updated = await applyReadingCorrection({
    reading,
    dispenser,
    patch,
    userId: user.id,
    auditAction: 'reading.manual_entry',
    auditMetadata: { dispenserId, ...patch },
  })
  return created(updated)
}
