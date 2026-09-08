// Where a ca's chỉ số đầu comes from. The đầu ca of a trụ is the cuối ca the kế toán
// last duyệt for it on an earlier ngày — whatever that ca sold, even nothing — read
// straight off the số liệu rather than off `Dispenser.lastElectronicReading`. That
// cache is written only when a ca is chốt'd, so a ca still chờ duyệt at midnight, or a
// trụ that sold 0 L, used to leave the next ngày without an đầu (report L1 #9/#10).
// The cache remains the fallback for a trụ with no duyệt'd history at all (a fresh
// lắp, a seeded baseline).
import { type Dispenser, Prisma } from '@/lib/generated/prisma/client'
import { deriveReviewState } from '@/lib/matching/review-state'
import { prisma } from '@/lib/prisma'
import { APPROVED_REVIEW_STATUSES, PENDING_REVIEW_STATUSES } from '@/lib/shifts/completion'

export type OpeningReadings = { electronic: number | null; mechanical: number | null }

type DecimalRow = { electronic: Prisma.Decimal | null; mechanical: Prisma.Decimal | null }

/**
 * The latest duyệt'd closing of each meter of a trụ, taken independently — a ca whose
 * mechanical photo never came still hands its electronic closing on. `before` bounds
 * the ngày (exclusive); null means over the whole history, which is what the cache
 * should hold. Null per meter when no duyệt'd closing exists.
 */
export async function latestApprovedClosings(
  dispenserId: string,
  before: Date | null,
  db: Prisma.TransactionClient = prisma
): Promise<OpeningReadings> {
  // Dates travel as YYYY-MM-DD: `shift_date` is a DATE column and the JS value is UTC
  // midnight, so casting a timestamp in the session zone could slip a day.
  const bound = before
    ? Prisma.sql`AND s.shift_date < ${before.toISOString().slice(0, 10)}::date`
    : Prisma.empty
  const approved = Prisma.join([...APPROVED_REVIEW_STATUSES])
  const rows = await db.$queryRaw<DecimalRow[]>`
    SELECT
      (SELECT r.electronic_reading
         FROM shift_readings r JOIN shifts s ON s.id = r.shift_id
        WHERE r.dispenser_id = ${dispenserId}::uuid
          AND r.review_status IN (${approved})
          AND r.electronic_reading IS NOT NULL ${bound}
        ORDER BY s.shift_date DESC, r.reviewed_at DESC NULLS LAST, r.created_at DESC
        LIMIT 1) AS electronic,
      (SELECT r.mechanical_reading
         FROM shift_readings r JOIN shifts s ON s.id = r.shift_id
        WHERE r.dispenser_id = ${dispenserId}::uuid
          AND r.review_status IN (${approved})
          AND r.mechanical_reading IS NOT NULL ${bound}
        ORDER BY s.shift_date DESC, r.reviewed_at DESC NULLS LAST, r.created_at DESC
        LIMIT 1) AS mechanical
  `
  const row = rows[0]
  return {
    electronic: row?.electronic == null ? null : Number(row.electronic),
    mechanical: row?.mechanical == null ? null : Number(row.mechanical),
  }
}

/**
 * The chỉ số đầu a trụ's reading in the ca of `shiftDate` should be snapshotted with:
 * the latest duyệt'd closing from an earlier ngày, per meter, else the trụ's cache.
 * Every place an đầu is snapshotted (photo ingest, hand-typed row, re-snapshot after a
 * correction) asks here, so no two can disagree.
 */
export async function openingReadingsFor(
  dispenserId: string,
  shiftDate: Date,
  db: Prisma.TransactionClient = prisma
): Promise<OpeningReadings> {
  const closings = await latestApprovedClosings(dispenserId, shiftDate, db)
  if (closings.electronic !== null && closings.mechanical !== null) return closings
  const cache = await db.dispenser.findUnique({
    where: { id: dispenserId },
    select: { lastElectronicReading: true, lastMechanicalReading: true },
  })
  return {
    electronic:
      closings.electronic ??
      (cache?.lastElectronicReading == null ? null : Number(cache.lastElectronicReading)),
    mechanical:
      closings.mechanical ??
      (cache?.lastMechanicalReading == null ? null : Number(cache.lastMechanicalReading)),
  }
}

/**
 * Carries a duyệt'd closing forward, after a reading is duyệt'd or a duyệt'd one is
 * corrected: the trụ's cache is refreshed to its latest duyệt'd closing, and every
 * undecided reading of a later ngày has its đầu snapshotted again and its review state
 * re-derived — a `missing_opening` born of a ca that was still chờ duyệt when the next
 * ngày's photos landed, or a `reading_decreased` born of an old number, goes with it.
 * Decided later rows are frozen, as everywhere else.
 */
export async function propagateApprovedClosing(
  dispenser: Pick<Dispenser, 'id' | 'hasElectronicMeter' | 'hasMechanicalMeter'>,
  shiftId: string
): Promise<void> {
  const shift = await prisma.shift.findUniqueOrThrow({
    where: { id: shiftId },
    select: { shiftDate: true },
  })
  const latest = await latestApprovedClosings(dispenser.id, null)
  if (latest.electronic !== null || latest.mechanical !== null) {
    await prisma.dispenser.update({
      where: { id: dispenser.id },
      data: {
        ...(latest.electronic !== null && { lastElectronicReading: latest.electronic }),
        ...(latest.mechanical !== null && { lastMechanicalReading: latest.mechanical }),
      },
    })
  }
  const later = await prisma.$queryRaw<{ reading_id: string; shift_date: Date }[]>`
    SELECT r.id AS reading_id, s.shift_date
      FROM shift_readings r JOIN shifts s ON s.id = r.shift_id
     WHERE r.dispenser_id = ${dispenser.id}::uuid
       AND s.shift_date > ${shift.shiftDate.toISOString().slice(0, 10)}::date
       AND r.review_status IN (${Prisma.join([...PENDING_REVIEW_STATUSES])})
     ORDER BY s.shift_date ASC
  `
  for (const { reading_id, shift_date } of later) {
    const row = await prisma.shiftReading.findUniqueOrThrow({ where: { id: reading_id } })
    const opening = await openingReadingsFor(dispenser.id, shift_date)
    const review = deriveReviewState({
      electronicReading: row.electronicReading == null ? null : Number(row.electronicReading),
      mechanicalReading: row.mechanicalReading == null ? null : Number(row.mechanicalReading),
      openingElectronicReading: opening.electronic,
      openingMechanicalReading: opening.mechanical,
      electronicConfidence: row.aiElectronicConfidence,
      mechanicalConfidence: row.aiMechanicalConfidence,
      hasElectronicMeter: dispenser.hasElectronicMeter,
      hasMechanicalMeter: dispenser.hasMechanicalMeter,
      hasElectronicPhoto: row.electronicPhotoId != null,
      hasMechanicalPhoto: row.mechanicalPhotoId != null,
    })
    await prisma.shiftReading.update({
      where: { id: row.id },
      data: {
        openingElectronicReading: opening.electronic,
        openingMechanicalReading: opening.mechanical,
        isAnomaly: review.isAnomaly,
        anomalyReasons: review.anomalyReasons,
        reviewStatus: review.reviewStatus,
      },
    })
  }
}
