import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { canEditOpening, isReadingFrozen } from '@/lib/auth/reading-policy'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'
import { applyReadingCorrection } from '@/lib/readings/apply-correction'

// Readings are stored as strings to preserve leading zeros (see lib/ai).
const correctOpeningSchema = z.object({
  openingElectronicReading: z.string().nullable().optional(),
  openingMechanicalReading: z.string().nullable().optional(),
})

/** Repairs an opening, for admin only and only before Chốt ca. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!canEditOpening(user.role)) return forbidden()
  const { id } = await params

  const parsed = correctOpeningSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())

  const reading = await prisma.shiftReading.findUnique({ where: { id } })
  if (!reading) return notFound()
  if (isReadingFrozen(user.role, reading.reviewStatus)) return forbidden()
  const shift = await prisma.shift.findUnique({ where: { id: reading.shiftId } })
  if (!shift) return notFound()
  if (shift.status === 'completed') return forbidden()
  const dispenser = await prisma.dispenser.findUnique({ where: { id: reading.dispenserId } })
  if (!dispenser) return notFound()

  const updated = await applyReadingCorrection({
    reading,
    dispenser,
    patch: parsed.data,
    userId: user.id,
    auditAction: 'reading.correct_opening',
  })
  return ok(updated)
}
