import { writeAudit } from '@/lib/auth/audit'
import { type AppRole } from '@/lib/auth/permissions'
import { isReadingFrozen, reviewStatusAfterEdit } from '@/lib/auth/reading-policy'
import { type Dispenser, type Prisma, type ShiftReading } from '@/lib/generated/prisma/client'
import { deriveReviewState } from '@/lib/matching/review-state'
import { prisma } from '@/lib/prisma'
import { isApprovedReading } from '@/lib/shifts/completion'
import {
  ReadingFrozenError,
  lockOpenShift,
  propagateApprovedClosing,
} from '@/lib/shifts/opening-reading'

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
 * Apply a correction and its dependent openings/cache together. Human decisions
 * remain in place; recompute anomaly fields without undoing Duyệt / Từ chối.
 *
 * The row is read — or, for a Trụ with none yet, created — only after the ca is
 * locked, so the correction is computed from the row as it stands and a Chốt ca in
 * flight either sees all of it or refuses it. The freeze is re-checked there too.
 */
export async function applyReadingCorrection(params: {
  shiftId: string
  load: (db: Prisma.TransactionClient) => Promise<ShiftReading>
  role: AppRole
  dispenser: Dispenser
  patch: ReadingCorrectionPatch
  userId: string
  auditAction: string
  auditMetadata?: unknown
}): Promise<ShiftReading> {
  const { shiftId, load, role, dispenser, patch, userId, auditAction, auditMetadata } = params
  return prisma.$transaction(
    async (db) => {
      await lockOpenShift(db, shiftId)
      const reading = await load(db)
      if (isReadingFrozen(role, reading.reviewStatus)) throw new ReadingFrozenError()
      const data = correctionData(reading, dispenser, patch, userId)
      const updated = await db.shiftReading.update({ where: { id: reading.id }, data })
      if (
        (patch.electronicReading !== undefined || patch.mechanicalReading !== undefined) &&
        isApprovedReading(updated)
      ) {
        await propagateApprovedClosing(dispenser, reading.shiftId, db)
      }
      await writeAudit(
        {
          userId,
          action: auditAction,
          entity: 'shift_reading',
          entityId: reading.id,
          metadata: {
            ...(auditMetadata as Record<string, unknown>),
            from: {
              openingElectronicReading: reading.openingElectronicReading?.toString() ?? null,
              openingMechanicalReading: reading.openingMechanicalReading?.toString() ?? null,
              electronicReading: reading.electronicReading?.toString() ?? null,
              mechanicalReading: reading.mechanicalReading?.toString() ?? null,
            },
            to: {
              openingElectronicReading: updated.openingElectronicReading?.toString() ?? null,
              openingMechanicalReading: updated.openingMechanicalReading?.toString() ?? null,
              electronicReading: updated.electronicReading?.toString() ?? null,
              mechanicalReading: updated.mechanicalReading?.toString() ?? null,
            },
          },
        },
        db
      )
      return updated
    },
    { timeout: 15000 }
  )
}

/** The column writes a correction makes on `reading`, as it stands under the lock. */
function correctionData(
  reading: ShiftReading,
  dispenser: Dispenser,
  patch: ReadingCorrectionPatch,
  userId: string
): Prisma.ShiftReadingUpdateInput {
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
  data.reviewStatus = reviewStatusAfterEdit(reading.reviewStatus, review.reviewStatus)

  return data
}
