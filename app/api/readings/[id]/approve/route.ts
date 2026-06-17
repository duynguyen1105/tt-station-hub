import { notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params

  const reading = await prisma.shiftReading.findUnique({ where: { id } })
  if (!reading) return notFound()

  const updated = await prisma.shiftReading.update({
    where: { id },
    data: { reviewStatus: 'approved', reviewedBy: user.id, reviewedAt: new Date() },
  })
  await writeAudit({
    userId: user.id,
    action: 'reading.approve',
    entity: 'shift_reading',
    entityId: id,
  })
  return ok(updated)
}
