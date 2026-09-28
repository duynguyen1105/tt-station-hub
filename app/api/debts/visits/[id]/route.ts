import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { canEditDebtVisit } from '@/lib/debts/visit-review'
import { logger } from '@/lib/logger'
import { deletePhotoRecords } from '@/lib/photos/delete-records'
import { prisma } from '@/lib/prisma'
import { deletePhoto } from '@/lib/storage/photo-storage'
import { vi } from '@/messages/vi'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role === 'viewer') return forbidden()
  const { id } = await params

  const visit = await prisma.debtVehicleVisit.findUnique({ where: { id } })
  if (!visit) return notFound()
  if (!(await canReachStation(user, visit.stationId))) return forbidden()
  if (!canEditDebtVisit(user.role, visit.reviewStatus)) return forbidden()

  const photoIds = [
    ...new Set([visit.vehiclePhotoId, visit.meterPhotoId].filter((p): p is string => p !== null)),
  ]
  let paths: string[]
  try {
    paths = await prisma.$transaction(async (db) => {
      const removed = await db.debtVehicleVisit.deleteMany({
        where: { id, reviewStatus: visit.reviewStatus, reviewedAt: visit.reviewedAt },
      })
      if (removed.count !== 1) throw new Error('stale')
      if (visit.reviewStatus === 'approved') {
        const charge = await db.debtTransaction.deleteMany({
          where: { sourceRef: id, txType: 'charge' },
        })
        if (charge.count !== 1) throw new Error('charge')
      }
      const storagePaths = await deletePhotoRecords(db, photoIds)
      await writeAudit(
        {
          userId: user.id,
          action: 'debt_visit.delete',
          entity: 'debt_vehicle_visit',
          entityId: id,
          metadata: {
            plate: visit.plateConfirmed ?? visit.plateRead,
            liters: visit.litersRead?.toString() ?? null,
            amount: visit.amountOverride?.toString() ?? visit.computedAmount?.toString() ?? null,
            reviewStatus: visit.reviewStatus,
            vehiclePhotoId: visit.vehiclePhotoId,
            meterPhotoId: visit.meterPhotoId,
          },
        },
        db
      )
      return storagePaths
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'stale')
      return badRequest(vi.debtReview.changedSinceOpen)
    if (error instanceof Error && error.message === 'charge')
      return badRequest(vi.debtReview.chargeMissing)
    throw error
  }

  for (const path of paths) {
    try {
      await deletePhoto(path)
    } catch (error) {
      logger.error({ error, path, visitId: id }, 'Debt visit photo removal failed')
    }
  }
  return ok({ id })
}
