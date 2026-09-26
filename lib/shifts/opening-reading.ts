// Where a ca's chỉ số đầu comes from. The đầu ca of a trụ is the cuối ca the kế toán
// last duyệt for it on an earlier ngày — whatever that ca sold, even nothing — read
// straight off the số liệu rather than off `Dispenser.lastElectronicReading`.
// The cache is updated by approval/correction/completion and remains the
// fallback for a trụ with no approved history (a fresh lắp, a seeded baseline).
import { badRequest } from '@/lib/api/response'
import { reviewStatusAfterEdit } from '@/lib/auth/reading-policy'
import { formatDate } from '@/lib/format'
import { type Dispenser, Prisma } from '@/lib/generated/prisma/client'
import { deriveReviewState } from '@/lib/matching/review-state'
import { prisma } from '@/lib/prisma'
import { APPROVED_REVIEW_STATUSES } from '@/lib/shifts/completion'
import { vi } from '@/messages/vi'

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
 * Thrown inside the edit's transaction when a changed closing would move the chỉ số đầu
 * of a ca already chốt'd: that ca posted its sales from the old đầu, so moving it
 * would count the difference twice. The admin Mở lại ca that ca first.
 */
export class LaterShiftCompletedError extends Error {
  constructor(shiftDate: Date) {
    super(vi.shifts.laterShiftCompleted(formatDate(shiftDate)))
  }
}

/** Thrown inside an edit's transaction when its own ca was chốt'd while the edit was on its way. */
export class ShiftCompletedError extends Error {
  constructor() {
    super(vi.shifts.completedLocked)
  }
}

/** A route's answer to a refused edit on a chốt'd ca; any other error is not ours to swallow. */
export function shiftLockRefusal(error: unknown) {
  if (error instanceof LaterShiftCompletedError || error instanceof ShiftCompletedError) {
    return badRequest(error.message)
  }
  throw error
}

/**
 * Row-locks a ca until the transaction ends and returns its status as of now. Chốt ca
 * and Mở lại ca claim the same row with their first statement, before they read a
 * single reading, so an edit holding it is either seen whole by that chốt or finds the
 * ca already chốt'd — never slipped in between chốt reading the numbers and posting
 * the sale.
 */
export async function lockShift(db: Prisma.TransactionClient, shiftId: string): Promise<string> {
  const [row] = await db.$queryRaw<{ status: string }[]>`
    SELECT status FROM shifts WHERE id = ${shiftId}::uuid FOR UPDATE
  `
  return row?.status ?? ''
}

/** Locks the ca an edit writes into, and refuses the edit if it has been chốt'd. */
export async function lockOpenShift(db: Prisma.TransactionClient, shiftId: string) {
  if ((await lockShift(db, shiftId)) === 'completed') throw new ShiftCompletedError()
}

const sameNumber = (a: Prisma.Decimal | null, b: number | null) =>
  (a == null ? null : Number(a)) === b

/**
 * Carry a changed decision/closing forward in the same transaction as its row: every
 * later reading of the trụ whose đầu comes from it follows — a duyệt'd / từ chối'd one
 * too, keeping its verdict, since an đầu that disagrees with the cuối before it counts
 * the difference twice in the kho. A later ca already chốt'd refuses the whole edit.
 * On rejecting the last approved read, restore the opening that preceded it.
 *
 * Every later ca is locked (in date order, before the trụ cache Chốt ca also writes)
 * before its status is trusted, so a chốt in flight either finishes first — and this
 * edit is refused — or waits and reads the đầu this edit leaves.
 */
export async function propagateApprovedClosing(
  dispenser: Pick<Dispenser, 'id' | 'hasElectronicMeter' | 'hasMechanicalMeter'>,
  shiftId: string,
  db: Prisma.TransactionClient = prisma,
  fallback?: OpeningReadings
): Promise<void> {
  const shift = await db.shift.findUniqueOrThrow({
    where: { id: shiftId },
    select: { shiftDate: true },
  })
  const later = await db.$queryRaw<{ reading_id: string; shift_id: string; shift_date: Date }[]>`
    SELECT r.id AS reading_id, r.shift_id, s.shift_date
      FROM shift_readings r JOIN shifts s ON s.id = r.shift_id
     WHERE r.dispenser_id = ${dispenser.id}::uuid
       AND s.shift_date > ${shift.shiftDate.toISOString().slice(0, 10)}::date
     ORDER BY s.shift_date ASC, s.id ASC
  `
  const statusOf = new Map<string, string>()
  for (const { shift_id } of later) {
    if (!statusOf.has(shift_id)) statusOf.set(shift_id, await lockShift(db, shift_id))
  }
  const latest = await latestApprovedClosings(dispenser.id, null, db)
  if (latest.electronic !== null || latest.mechanical !== null || fallback) {
    await db.dispenser.update({
      where: { id: dispenser.id },
      data: {
        ...(latest.electronic !== null || fallback
          ? { lastElectronicReading: latest.electronic ?? fallback?.electronic ?? null }
          : {}),
        ...(latest.mechanical !== null || fallback
          ? { lastMechanicalReading: latest.mechanical ?? fallback?.mechanical ?? null }
          : {}),
      },
    })
  }
  for (const { reading_id, shift_id, shift_date } of later) {
    const row = await db.shiftReading.findUniqueOrThrow({ where: { id: reading_id } })
    const opening = await openingReadingsFor(dispenser.id, shift_date, db)
    const moved =
      !sameNumber(row.openingElectronicReading, opening.electronic) ||
      !sameNumber(row.openingMechanicalReading, opening.mechanical)
    if (!moved) continue
    if (statusOf.get(shift_id) === 'completed') throw new LaterShiftCompletedError(shift_date)
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
    await db.shiftReading.update({
      where: { id: row.id },
      data: {
        openingElectronicReading: opening.electronic,
        openingMechanicalReading: opening.mechanical,
        isAnomaly: review.isAnomaly,
        anomalyReasons: review.anomalyReasons,
        reviewStatus: reviewStatusAfterEdit(row.reviewStatus, review.reviewStatus),
      },
    })
  }
}
