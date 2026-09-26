import { forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { type ShiftStatus, canReviewShift, isReadingDecided } from '@/lib/auth/reading-policy'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { prisma } from '@/lib/prisma'
import { isApprovedReading } from '@/lib/shifts/completion'
import {
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
  if (
    user.role !== 'admin' &&
    (isReadingDecided(reading.reviewStatus) || reading.reviewStatus === 'auto_approved')
  )
    return forbidden()

  const updated = await prisma
    .$transaction(
      async (db) => {
        await lockOpenShift(db, reading.shiftId)
        const rejected = await db.shiftReading.update({
          where: { id },
          data: { reviewStatus: 'rejected', reviewedBy: user.id, reviewedAt: new Date() },
        })
        if (isApprovedReading(reading)) {
          const dispenser = await db.dispenser.findUnique({
            where: { id: reading.dispenserId },
            select: { id: true, hasElectronicMeter: true, hasMechanicalMeter: true },
          })
          if (dispenser) {
            await propagateApprovedClosing(dispenser, reading.shiftId, db, {
              electronic:
                reading.openingElectronicReading == null
                  ? null
                  : Number(reading.openingElectronicReading),
              mechanical:
                reading.openingMechanicalReading == null
                  ? null
                  : Number(reading.openingMechanicalReading),
            })
          }
        }
        await writeAudit(
          {
            userId: user.id,
            action: 'reading.reject',
            entity: 'shift_reading',
            entityId: id,
            metadata: { from: reading.reviewStatus, to: rejected.reviewStatus },
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
