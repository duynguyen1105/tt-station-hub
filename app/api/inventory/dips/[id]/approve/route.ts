import { forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { canReviewTankDip } from '@/lib/inventory/dip-review'
import { prisma } from '@/lib/prisma'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params

  const dip = await prisma.tankDipRecord.findUnique({ where: { id } })
  if (!dip) return notFound()
  // The đo hầm's own trạm decides, not the screen the row was reached from.
  if (!(await canReachStation(user, dip.stationId))) return forbidden()
  if (!canReviewTankDip(user.role)) return forbidden()

  const updated = await prisma.tankDipRecord.update({
    where: { id },
    data: { reviewStatus: 'approved', reviewedBy: user.id, reviewedAt: new Date() },
  })
  await writeAudit({
    userId: user.id,
    action: 'tank_dip.approve',
    entity: 'tank_dip_record',
    entityId: id,
  })
  return ok(updated)
}
