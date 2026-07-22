import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, notFound, ok, unauthorized } from '@/lib/api/response'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'
import { applyReadingCorrection } from '@/lib/readings/apply-correction'

// Readings are stored as strings to preserve leading zeros (see lib/ai).
const correctSchema = z.object({
  openingElectronicReading: z.string().nullable().optional(),
  electronicReading: z.string().nullable().optional(),
  openingMechanicalReading: z.string().nullable().optional(),
  mechanicalReading: z.string().nullable().optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params

  const parsed = correctSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())

  const reading = await prisma.shiftReading.findUnique({ where: { id } })
  if (!reading) return notFound()
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
