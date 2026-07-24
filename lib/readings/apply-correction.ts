import { writeAudit } from '@/lib/auth/audit'
import { type Dispenser, type Prisma, type ShiftReading } from '@/lib/generated/prisma/client'
import { deriveReviewState } from '@/lib/matching/review-state'
import { prisma } from '@/lib/prisma'

// Readings are stored as strings to preserve leading zeros (see lib/ai). A field
// left `undefined` is untouched; an explicit `null` clears it.
export type ReadingCorrectionPatch = {
  openingElectronicReading?: string | null
  electronicReading?: string | null
  openingMechanicalReading?: string | null
  mechanicalReading?: string | null
}

function num(value: unknown): number | null {
  return value == null ? null : Number(value)
}

/**
 * The shared tail of every reading correction: apply the patch (preserving the
 * original AI value the first time a closing field is corrected), re-derive the
 * review state so an entered opening clears the missing-opening flag, persist,
 * and write the audit entry. The role gate lives in each route; this helper is
 * reached only after it passes. See docs/adr/0001.
 */
export async function applyReadingCorrection(params: {
  reading: ShiftReading
  dispenser: Dispenser
  patch: ReadingCorrectionPatch
  userId: string
  auditAction: string
  auditMetadata: unknown
}): Promise<ShiftReading> {
  const { reading, dispenser, patch, userId, auditAction, auditMetadata } = params

  const data: Prisma.ShiftReadingUpdateInput = {
    reviewedBy: userId,
    reviewedAt: new Date(),
  }

  // Correction is the single place an opening is established or repaired, so it
  // may set the opening even though ingest treats it as immutable once snapshotted.
  if (patch.openingElectronicReading !== undefined) {
    data.openingElectronicReading = patch.openingElectronicReading
  }
  if (patch.openingMechanicalReading !== undefined) {
    data.openingMechanicalReading = patch.openingMechanicalReading
  }

  // Preserve the original AI value the first time a closing field is corrected.
  if (patch.electronicReading !== undefined) {
    if (reading.originalElectronicReading === null) {
      data.originalElectronicReading = reading.electronicReading
    }
    data.electronicReading = patch.electronicReading
  }
  if (patch.mechanicalReading !== undefined) {
    if (reading.originalMechanicalReading === null) {
      data.originalMechanicalReading = reading.mechanicalReading
    }
    data.mechanicalReading = patch.mechanicalReading
  }

  // Re-run the shared review-state rule so entering an opening clears the
  // missing-opening flag and recomputes warnings in one step.
  function pick(next: string | null | undefined, current: Prisma.Decimal | null): number | null {
    return next !== undefined ? num(next) : num(current)
  }
  const review = deriveReviewState({
    electronicReading: pick(patch.electronicReading, reading.electronicReading),
    mechanicalReading: pick(patch.mechanicalReading, reading.mechanicalReading),
    openingElectronicReading: pick(
      patch.openingElectronicReading,
      reading.openingElectronicReading
    ),
    openingMechanicalReading: pick(
      patch.openingMechanicalReading,
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

  const updated = await prisma.shiftReading.update({ where: { id: reading.id }, data })
  await writeAudit({
    userId,
    action: auditAction,
    entity: 'shift_reading',
    entityId: reading.id,
    metadata: auditMetadata,
  })
  return updated
}
