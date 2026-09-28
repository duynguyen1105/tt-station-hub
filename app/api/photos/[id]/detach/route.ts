import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { type ShiftStatus, canEditClosing, isReadingFrozen } from '@/lib/auth/reading-policy'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { ANOMALY_REASONS, DEFAULT_ANOMALY_CONFIG } from '@/lib/matching/anomaly-detection'
import { deriveReviewState } from '@/lib/matching/review-state'
import { planDetachShiftPhoto } from '@/lib/photos/detach-shift-photo'
import { prisma } from '@/lib/prisma'
import { isApprovedReading } from '@/lib/shifts/completion'
import {
  lockOpenShift,
  propagateApprovedClosing,
  shiftLockRefusal,
} from '@/lib/shifts/opening-reading'
import { vi } from '@/messages/vi'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params
  const photo = await prisma.shiftPhoto.findUnique({ where: { id } })
  if (!photo) return notFound()
  if (!photo.matchedReadingId) return badRequest(vi.photoFix.notMatched)
  const reading = await prisma.shiftReading.findUnique({ where: { id: photo.matchedReadingId } })
  if (!reading || !photo.shiftId || photo.shiftId !== reading.shiftId) {
    return badRequest(vi.photoFix.notMatched)
  }
  const shift = await prisma.shift.findUnique({ where: { id: reading.shiftId } })
  if (!shift) return notFound()
  if (!(await canReachStation(user, shift.stationId))) return forbidden()
  if (!canEditClosing(user.role, shift.status as ShiftStatus)) return forbidden()

  const result = await prisma
    .$transaction(
      async (tx) => {
        // Match the upload lock order: dispenser first, then ca. Both protect the
        // holder, cross-checks and closing against concurrent photo intake/chốt.
        await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`${shift.id}:${reading.dispenserId}`}, 0)) AS l) AS t`
        await lockOpenShift(tx, shift.id)
        const current = await tx.shiftReading.findUnique({ where: { id: reading.id } })
        const source = await tx.shiftPhoto.findUnique({ where: { id } })
        if (
          !current ||
          !source ||
          source.matchedReadingId !== current.id ||
          source.shiftId !== shift.id
        ) {
          return badRequest(vi.photoFix.notMatched)
        }
        if (isReadingFrozen(user.role, current.reviewStatus)) return forbidden()
        const dispenser = await tx.dispenser.findUnique({
          where: { id: current.dispenserId },
          select: { id: true, hasElectronicMeter: true, hasMechanicalMeter: true },
        })
        if (!dispenser) return notFound()
        const photos = await tx.shiftPhoto.findMany({
          where: { matchedReadingId: current.id },
          select: { id: true, matchedReadingId: true, meterType: true },
        })
        const plan = planDetachShiftPhoto(current, photos, id)
        if (!plan) return badRequest(vi.photoFix.notMatched)
        const holder =
          (plan.slot === 'electronic' ? current.electronicPhotoId : current.mechanicalPhotoId) ===
          id
        let update
        if (holder) {
          const electronic = plan.slot === 'electronic'
          const next = {
            electronicReading: electronic ? null : current.electronicReading,
            mechanicalReading: electronic ? current.mechanicalReading : null,
            electronicPhotoId: electronic ? null : current.electronicPhotoId,
            mechanicalPhotoId: electronic ? current.mechanicalPhotoId : null,
            aiElectronicConfidence: electronic ? null : current.aiElectronicConfidence,
            aiMechanicalConfidence: electronic ? current.aiMechanicalConfidence : null,
          }
          const review = deriveReviewState(
            {
              electronicReading:
                next.electronicReading == null ? null : Number(next.electronicReading),
              mechanicalReading:
                next.mechanicalReading == null ? null : Number(next.mechanicalReading),
              openingElectronicReading:
                current.openingElectronicReading == null
                  ? null
                  : Number(current.openingElectronicReading),
              openingMechanicalReading:
                current.openingMechanicalReading == null
                  ? null
                  : Number(current.openingMechanicalReading),
              electronicConfidence: next.aiElectronicConfidence,
              mechanicalConfidence: next.aiMechanicalConfidence,
              hasElectronicMeter: dispenser.hasElectronicMeter,
              hasMechanicalMeter: dispenser.hasMechanicalMeter,
              hasElectronicPhoto: next.electronicPhotoId != null,
              hasMechanicalPhoto: next.mechanicalPhotoId != null,
            },
            DEFAULT_ANOMALY_CONFIG
          )
          update = {
            ...next,
            ...(electronic
              ? { originalElectronicReading: null }
              : { originalMechanicalReading: null }),
            isAnomaly: review.isAnomaly,
            anomalyReasons: review.anomalyReasons,
            reviewStatus: review.reviewStatus,
            reviewedBy: null,
            reviewedAt: null,
          }
        } else if (
          plan.dropDuplicateFlag &&
          current.anomalyReasons.includes(ANOMALY_REASONS.duplicatePhotoMismatch)
        ) {
          const anomalyReasons = current.anomalyReasons.filter(
            (reason) => reason !== ANOMALY_REASONS.duplicatePhotoMismatch
          )
          update = { anomalyReasons, isAnomaly: anomalyReasons.length > 0 }
        }
        if (update) await tx.shiftReading.update({ where: { id: current.id }, data: update })
        await tx.shiftPhoto.updateMany({
          where: { id: { in: plan.unmatchedIds }, matchedReadingId: current.id },
          data: { matchStatus: 'unmatched', matchedReadingId: null },
        })
        if (holder && isApprovedReading(current)) {
          await propagateApprovedClosing(dispenser, shift.id, tx, {
            electronic:
              current.openingElectronicReading == null
                ? null
                : Number(current.openingElectronicReading),
            mechanical:
              current.openingMechanicalReading == null
                ? null
                : Number(current.openingMechanicalReading),
          })
        }
        await writeAudit(
          {
            userId: user.id,
            action: 'photo.detach',
            entity: 'shift_photo',
            entityId: id,
            metadata: {
              shiftId: shift.id,
              readingId: current.id,
              slot: plan.slot,
              holder,
              unmatchedPhotoIds: plan.unmatchedIds,
              photoMatchStatus: source.matchStatus,
              from: {
                electronicReading: current.electronicReading?.toString() ?? null,
                mechanicalReading: current.mechanicalReading?.toString() ?? null,
                electronicPhotoId: current.electronicPhotoId,
                mechanicalPhotoId: current.mechanicalPhotoId,
                reviewStatus: current.reviewStatus,
                anomalyReasons: current.anomalyReasons,
              },
            },
          },
          tx
        )
        return ok({ unmatchedPhotoIds: plan.unmatchedIds })
      },
      { timeout: 15000 }
    )
    .catch(shiftLockRefusal)
  return result
}
