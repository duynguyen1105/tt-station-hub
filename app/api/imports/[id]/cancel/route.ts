import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { prisma } from '@/lib/prisma'

/**
 * Cancels a fuel-import slip: the row is stamped (never deleted — documents and
 * audit trail stay) and a compensating -import movement takes the liters back
 * out of the estimated stock.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role === 'viewer') return forbidden()
  const { id } = await params

  const record = await prisma.fuelImport.findUnique({ where: { id } })
  if (!record) return notFound()
  if (!(await canReachStation(user, record.stationId))) return forbidden()
  if (record.canceledAt) return badRequest('Phiếu nhập này đã được hủy trước đó.')

  const liters = Number(record.litersActual)
  await prisma.$transaction(async (tx) => {
    await tx.fuelImport.update({
      where: { id },
      data: { canceledAt: new Date(), canceledBy: user.id },
    })
    await tx.inventoryMovement.create({
      data: {
        stationId: record.stationId,
        fuelType: record.fuelType,
        movementType: 'adjustment',
        quantity: -liters,
        sourceRef: id,
        note: 'Hủy phiếu nhập hàng',
        movementDate: new Date(),
        createdBy: user.id,
      },
    })
    await tx.inventoryBalance.upsert({
      where: {
        stationId_fuelType: { stationId: record.stationId, fuelType: record.fuelType },
      },
      update: { estimatedStock: { increment: -liters } },
      create: { stationId: record.stationId, fuelType: record.fuelType, estimatedStock: -liters },
    })
  })

  await writeAudit({
    userId: user.id,
    action: 'fuel_import.cancel',
    entity: 'fuel_import',
    entityId: id,
    metadata: { liters },
  })
  return ok({ id })
}
