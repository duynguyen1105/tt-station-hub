import { forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { type ShiftStatus, canReviewShift } from '@/lib/auth/reading-policy'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params

  const reading = await prisma.shiftReading.findUnique({ where: { id } })
  if (!reading) return notFound()
  const shift = await prisma.shift.findUnique({ where: { id: reading.shiftId } })
  if (!shift) return notFound()
  if (!canReviewShift(user.role, shift.status as ShiftStatus)) return forbidden()

  const updated = await prisma.shiftReading.update({
    where: { id },
    data: { reviewStatus: 'rejected', reviewedBy: user.id, reviewedAt: new Date() },
  })
  await writeAudit({
    userId: user.id,
    action: 'reading.reject',
    entity: 'shift_reading',
    entityId: id,
  })
  return ok(updated)
}
