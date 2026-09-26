import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { canEditDebtVisit, debtVisitDecision } from '@/lib/debts/visit-review'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

/** Rejects a debt visit: marks it rejected without charging the customer. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  // Người xem only reads.
  if (user.role === 'viewer') return forbidden()
  const { id } = await params

  const visit = await prisma.debtVehicleVisit.findUnique({ where: { id } })
  if (!visit) return notFound()
  if (!(await canReachStation(user, visit.stationId))) return forbidden()
  if (!canEditDebtVisit(user.role, visit.reviewStatus)) return forbidden()
  const decision = debtVisitDecision(visit.reviewStatus, 'reject')
  if (!decision) return badRequest(vi.debtReview.alreadyRejected)

  let updated
  try {
    updated = await prisma.$transaction(async (db) => {
      const changed = await db.debtVehicleVisit.updateMany({
        where: { id, reviewStatus: visit.reviewStatus, reviewedAt: visit.reviewedAt },
        data: { reviewStatus: decision.reviewStatus, reviewedBy: user.id, reviewedAt: new Date() },
      })
      if (changed.count !== 1) throw new Error('stale')
      if (decision.charge === 'delete') {
        const removed = await db.debtTransaction.deleteMany({
          where: { sourceRef: id, txType: 'charge' },
        })
        if (removed.count !== 1) throw new Error('charge')
      }
      return db.debtVehicleVisit.findUniqueOrThrow({ where: { id } })
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'stale')
      return badRequest(vi.debtReview.changedSinceOpen)
    if (error instanceof Error && error.message === 'charge')
      return badRequest(vi.debtReview.chargeMissing)
    throw error
  }

  await writeAudit({
    userId: user.id,
    action: 'debt_visit.reject',
    entity: 'debt_vehicle_visit',
    entityId: id,
    metadata: {
      previousStatus: visit.reviewStatus,
      reviewStatus: updated.reviewStatus,
      chargeRemoved: decision.charge === 'delete',
    },
  })
  return ok(updated)
}
