import { type NextRequest } from 'next/server'

import { notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'

/** Rejects a debt visit: marks it rejected without charging the customer. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params

  const visit = await prisma.debtVehicleVisit.findUnique({ where: { id } })
  if (!visit) return notFound()

  const updated = await prisma.debtVehicleVisit.update({
    where: { id },
    data: { reviewStatus: 'rejected', reviewedBy: user.id, reviewedAt: new Date() },
  })

  await writeAudit({
    userId: user.id,
    action: 'debt_visit.reject',
    entity: 'debt_vehicle_visit',
    entityId: id,
  })
  return ok(updated)
}
