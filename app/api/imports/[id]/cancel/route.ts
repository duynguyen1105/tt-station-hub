import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { shiftDateFor } from '@/lib/photos/ingest'
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

  const result = await prisma.$transaction(async (tx) => {
    // Receipt edits lock the parent first; cancellation takes the same lock so
    // the compensating movement always uses the latest liters, fuel and day.
    if (record.receiptId) {
      await tx.$queryRaw`SELECT id FROM fuel_import_receipts WHERE id = ${record.receiptId}::uuid FOR UPDATE`
    }
    await tx.$queryRaw`SELECT id FROM fuel_imports WHERE id = ${id}::uuid FOR UPDATE`
    const current = await tx.fuelImport.findUnique({ where: { id } })
    if (!current || current.canceledAt) return null
    const liters = Number(current.litersActual)
    await tx.fuelImport.update({
      where: { id },
      data: { canceledAt: new Date(), canceledBy: user.id },
    })
    await tx.inventoryMovement.create({
      data: {
        stationId: current.stationId,
        fuelType: current.fuelType,
        movementType: 'adjustment',
        quantity: -liters,
        sourceRef: id,
        note: 'Hủy phiếu nhập hàng',
        // The slip's own GMT+7 day: it nets to zero where it was booked, and a slip
        // dated before đầu kỳ is not taken out of a sổ it never entered.
        movementDate: shiftDateFor(current.importedAt.getTime()),
        createdBy: user.id,
      },
    })
    await tx.inventoryBalance.upsert({
      where: {
        stationId_fuelType: { stationId: current.stationId, fuelType: current.fuelType },
      },
      update: { estimatedStock: { increment: -liters } },
      create: { stationId: current.stationId, fuelType: current.fuelType, estimatedStock: -liters },
    })
    return liters
  })
  if (result === null) return badRequest('Phiếu nhập này đã được hủy trước đó.')

  await writeAudit({
    userId: user.id,
    action: 'fuel_import.cancel',
    entity: 'fuel_import',
    entityId: id,
    metadata: { liters: result },
  })
  return ok({ id })
}
