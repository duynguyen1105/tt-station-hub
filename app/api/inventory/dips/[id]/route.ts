import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { applyDipDelete } from '@/lib/inventory/apply-dip-correction'
import { canCorrectTankDip } from '@/lib/inventory/dip-review'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role === 'viewer') return forbidden()
  const { id } = await params

  const dip = await prisma.tankDipRecord.findUnique({ where: { id } })
  if (!dip) return notFound()
  if (!(await canReachStation(user, dip.stationId))) return forbidden()
  if (!canCorrectTankDip(user.role, dip.reviewStatus)) return forbidden()

  try {
    await applyDipDelete({ dip, userId: user.id })
  } catch (error) {
    if (error instanceof Error && error.message === 'stale')
      return badRequest(vi.inventory.dipChangedSinceOpen)
    throw error
  }
  return ok({ id })
}
