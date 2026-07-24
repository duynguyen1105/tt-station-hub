import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { type ShiftStatus, canEditClosing } from '@/lib/auth/reading-policy'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'
import { applyReadingCorrection } from '@/lib/readings/apply-correction'

// Readings are stored as strings to preserve leading zeros (see lib/ai).
const correctClosingSchema = z.object({
  electronicReading: z.string().nullable().optional(),
  mechanicalReading: z.string().nullable().optional(),
})

/**
 * Repairs a ca's closing readings (Cuối ĐT / Cuối Cơ) — the accountant's daily
 * review surface. Admin at any status, accountant until the ca is chốt; after
 * `completed` only the admin remains, so `canEditClosing` rejects a locked-out
 * caller even when hit directly. Writes only the closing fields and audits the
 * repair as `reading.correct`. See docs/adr/0001.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params

  const parsed = correctClosingSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())

  const reading = await prisma.shiftReading.findUnique({ where: { id } })
  if (!reading) return notFound()
  const shift = await prisma.shift.findUnique({ where: { id: reading.shiftId } })
  if (!shift) return notFound()
  if (!canEditClosing(user.role, shift.status as ShiftStatus)) return forbidden()
  const dispenser = await prisma.dispenser.findUnique({ where: { id: reading.dispenserId } })
  if (!dispenser) return notFound()

  const updated = await applyReadingCorrection({
    reading,
    dispenser,
    patch: parsed.data,
    userId: user.id,
    auditAction: 'reading.correct',
    auditMetadata: parsed.data,
  })
  return ok(updated)
}
