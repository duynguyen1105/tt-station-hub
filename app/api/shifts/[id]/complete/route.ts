import { badRequest, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params

  const shift = await prisma.shift.findUnique({ where: { id } })
  if (!shift) return notFound()
  if (shift.status === 'completed') return badRequest('Ca này đã được chốt.')

  // Block completion while readings still need review.
  const pending = await prisma.shiftReading.count({
    where: { shiftId: id, reviewStatus: { in: ['pending', 'needs_review'] } },
  })
  if (pending > 0) {
    return badRequest('Vẫn còn số liệu chưa được duyệt trong ca này.')
  }

  const updated = await prisma.shift.update({
    where: { id },
    data: { status: 'completed', completedAt: new Date(), reviewedBy: user.id },
  })
  await writeAudit({
    userId: user.id,
    action: 'shift.complete',
    entity: 'shift',
    entityId: id,
  })
  // TODO: post inventory 'sale' movements from approved electronic deltas
  // (wire lib/inventory/stock-calculator once fuel-type mapping is confirmed).
  return ok(updated)
}
