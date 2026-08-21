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

  // Từ chối is not a delete: the row stays in Lịch sử đo bồn, badged, as the
  // audit trail. What changes is that it stops counting as the hầm's tồn thực
  // tế (countableDipWhere), so the previous good dip takes over.
  const updated = await prisma.tankDipRecord.update({
    where: { id },
    data: { reviewStatus: 'rejected', reviewedBy: user.id, reviewedAt: new Date() },
  })
  await writeAudit({
    userId: user.id,
    action: 'tank_dip.reject',
    entity: 'tank_dip_record',
    entityId: id,
  })
  return ok(updated)
}
