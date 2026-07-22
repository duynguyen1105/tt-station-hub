import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { canEditOpening } from '@/lib/auth/reading-policy'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'
import { applyReadingCorrection } from '@/lib/readings/apply-correction'

// Readings are stored as strings to preserve leading zeros (see lib/ai).
const correctOpeningSchema = z.object({
  openingElectronicReading: z.string().nullable().optional(),
  openingMechanicalReading: z.string().nullable().optional(),
})

/**
 * Repairs a ca's opening readings (Đầu ĐT / Đầu Cơ). Admin only at any shift
 * status — the opening is the carry-forward of the prior ca's closing, so
 * `canEditOpening` rejects every non-admin caller even when hit directly. The
 * repair is audited with old and new opening values. See docs/adr/0001.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!canEditOpening(user.role)) return forbidden()
  const { id } = await params

  const parsed = correctOpeningSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())

  const reading = await prisma.shiftReading.findUnique({ where: { id } })
  if (!reading) return notFound()
  const dispenser = await prisma.dispenser.findUnique({ where: { id: reading.dispenserId } })
  if (!dispenser) return notFound()

  const oldOpening = {
    openingElectronicReading: reading.openingElectronicReading?.toString() ?? null,
    openingMechanicalReading: reading.openingMechanicalReading?.toString() ?? null,
  }
  const newOpening = {
    openingElectronicReading:
      parsed.data.openingElectronicReading !== undefined
        ? parsed.data.openingElectronicReading
        : oldOpening.openingElectronicReading,
    openingMechanicalReading:
      parsed.data.openingMechanicalReading !== undefined
        ? parsed.data.openingMechanicalReading
        : oldOpening.openingMechanicalReading,
  }

  const updated = await applyReadingCorrection({
    reading,
    dispenser,
    patch: parsed.data,
    userId: user.id,
    auditAction: 'reading.correct_opening',
    auditMetadata: { old: oldOpening, new: newOpening },
  })
  return ok(updated)
}
