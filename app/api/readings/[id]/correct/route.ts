import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { Prisma } from '@/lib/generated/prisma/client'
import { deriveReviewState } from '@/lib/matching/review-state'
import { prisma } from '@/lib/prisma'

// Readings are stored as strings to preserve leading zeros (see lib/ai).
const correctSchema = z.object({
  openingElectronicReading: z.string().nullable().optional(),
  electronicReading: z.string().nullable().optional(),
  openingMechanicalReading: z.string().nullable().optional(),
  mechanicalReading: z.string().nullable().optional(),
})

function num(value: unknown): number | null {
  return value == null ? null : Number(value)
}

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

  const data: Prisma.ShiftReadingUpdateInput = {
    reviewedBy: user.id,
    reviewedAt: new Date(),
  }

  // Correction is the single place an opening is established or repaired, so it
  // may set the opening even though ingest treats it as immutable once snapshotted.
  if (parsed.data.openingElectronicReading !== undefined) {
    data.openingElectronicReading = parsed.data.openingElectronicReading
  }
  if (parsed.data.openingMechanicalReading !== undefined) {
    data.openingMechanicalReading = parsed.data.openingMechanicalReading
  }

  // Preserve the original AI value the first time a closing field is corrected.
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

  // Re-run the shared review-state rule so entering an opening clears the
  // missing-opening flag and recomputes warnings in one step — the correction
  // path never re-derived its review state before (see ticket 01/04).
  function pick(next: string | null | undefined, current: Prisma.Decimal | null): number | null {
    return next !== undefined ? num(next) : num(current)
  }
  const review = deriveReviewState({
    electronicReading: pick(parsed.data.electronicReading, reading.electronicReading),
    mechanicalReading: pick(parsed.data.mechanicalReading, reading.mechanicalReading),
    openingElectronicReading: pick(
      parsed.data.openingElectronicReading,
      reading.openingElectronicReading
    ),
    openingMechanicalReading: pick(
      parsed.data.openingMechanicalReading,
      reading.openingMechanicalReading
    ),
    electronicConfidence: reading.aiElectronicConfidence,
    mechanicalConfidence: reading.aiMechanicalConfidence,
    hasElectronicMeter: dispenser.hasElectronicMeter,
    hasMechanicalMeter: dispenser.hasMechanicalMeter,
    hasElectronicPhoto: reading.electronicPhotoId != null,
    hasMechanicalPhoto: reading.mechanicalPhotoId != null,
  })
  data.isAnomaly = review.isAnomaly
  data.anomalyReasons = review.anomalyReasons
  data.reviewStatus = review.reviewStatus

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
