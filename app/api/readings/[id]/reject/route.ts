import { forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { type ShiftStatus, canReviewShift, mayDecideReading } from '@/lib/auth/reading-policy'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { prisma } from '@/lib/prisma'
import { isApprovedReading } from '@/lib/shifts/completion'
import {
  ReadingFrozenError,
  lockOpenShift,
  propagateApprovedClosing,
  shiftLockRefusal,
} from '@/lib/shifts/opening-reading'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params

  const reading = await prisma.shiftReading.findUnique({ where: { id } })
  if (!reading) return notFound()
  const shift = await prisma.shift.findUnique({ where: { id: reading.shiftId } })
  if (!shift) return notFound()
  if (!(await canReachStation(user, shift.stationId))) return forbidden()
  if (!canReviewShift(user.role, shift.status as ShiftStatus)) return forbidden()

  const updated = await prisma
    .$transaction(
      async (db) => {
        await lockOpenShift(db, reading.shiftId)
        // Decided on the row as it stands under the lock: a Duyệt that landed since the
        // lookup above is exactly the closing this Từ chối must take back out of the
        // later ca's đầu and the trụ cache.
        const current = await db.shiftReading.findUniqueOrThrow({ where: { id } })
        if (!mayDecideReading(user.role, current.reviewStatus)) throw new ReadingFrozenError()
        const rejected = await db.shiftReading.update({
          where: { id },
          data: { reviewStatus: 'rejected', reviewedBy: user.id, reviewedAt: new Date() },
        })
        if (isApprovedReading(current)) {
          const dispenser = await db.dispenser.findUnique({
            where: { id: current.dispenserId },
            select: { id: true, hasElectronicMeter: true, hasMechanicalMeter: true },
          })
          if (dispenser) {
            await propagateApprovedClosing(dispenser, current.shiftId, db, {
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
        }
        await writeAudit(
          {
            userId: user.id,
            action: 'reading.reject',
            entity: 'shift_reading',
            entityId: id,
            metadata: { from: current.reviewStatus, to: rejected.reviewStatus },
          },
          db
        )
        return rejected
      },
      { timeout: 15000 }
    )
    .catch(shiftLockRefusal)
  if (updated instanceof Response) return updated
  return ok(updated)
}
