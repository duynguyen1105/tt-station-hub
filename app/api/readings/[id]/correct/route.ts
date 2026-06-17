import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'

// Readings are stored as strings to preserve leading zeros (see lib/ai).
const correctSchema = z.object({
  electronicReading: z.string().nullable().optional(),
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

  const data: Prisma.ShiftReadingUpdateInput = {
    reviewStatus: 'corrected',
    reviewedBy: user.id,
    reviewedAt: new Date(),
  }

  // Preserve the original AI value the first time a field is corrected.
  if (parsed.data.electronicReading !== undefined) {
    if (reading.originalElectronicReading === null) {
      data.originalElectronicReading = reading.electronicReading
    }
    data.electronicReading = parsed.data.electronicReading
  }
  if (parsed.data.mechanicalReading !== undefined) {
    if (reading.originalMechanicalReading === null) {
      data.originalMechanicalReading = reading.mechanicalReading
    }
    data.mechanicalReading = parsed.data.mechanicalReading
  }

  const updated = await prisma.shiftReading.update({ where: { id }, data })
  await writeAudit({
    userId: user.id,
    action: 'reading.correct',
    entity: 'shift_reading',
    entityId: id,
    metadata: parsed.data,
  })
  return ok(updated)
}
