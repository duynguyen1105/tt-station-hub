import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { type ShiftStatus, canReviewShift } from '@/lib/auth/reading-policy'
import { getCurrentUser } from '@/lib/auth/session'
import { computeShiftSales } from '@/lib/inventory/shift-sales'
import { prisma } from '@/lib/prisma'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params

  const shift = await prisma.shift.findUnique({ where: { id } })
  if (!shift) return notFound()
  if (!canReviewShift(user.role, shift.status as ShiftStatus)) return forbidden()
  if (shift.status === 'completed') return badRequest('Ca này đã được chốt.')

  // Block completion while readings still need review.
  const pending = await prisma.shiftReading.count({
    where: { shiftId: id, reviewStatus: { in: ['pending', 'needs_review'] } },
  })
  if (pending > 0) {
    return badRequest('Vẫn còn số liệu chưa được duyệt trong ca này.')
  }

  // Approved readings drive the inventory deduction (sold liters per fuel type).
  const [readings, dispensers] = await Promise.all([
    prisma.shiftReading.findMany({
      where: { shiftId: id, reviewStatus: { in: ['approved', 'auto_approved', 'corrected'] } },
    }),
    prisma.dispenser.findMany({ where: { stationId: shift.stationId } }),
  ])

  const { sales, advances } = computeShiftSales(
    readings.map((r) => ({
      dispenserId: r.dispenserId,
      openingElectronicReading:
        r.openingElectronicReading !== null ? Number(r.openingElectronicReading) : null,
      electronicReading: r.electronicReading !== null ? Number(r.electronicReading) : null,
      openingMechanicalReading:
        r.openingMechanicalReading !== null ? Number(r.openingMechanicalReading) : null,
      mechanicalReading: r.mechanicalReading !== null ? Number(r.mechanicalReading) : null,
    })),
    dispensers.map((d) => ({ id: d.id, fuelType: d.fuelType }))
  )

  const updated = await prisma.$transaction(async (db) => {
    const shiftRow = await db.shift.update({
      where: { id },
      data: { status: 'completed', completedAt: new Date(), reviewedBy: user.id },
    })

    for (const sale of sales) {
      await db.inventoryMovement.create({
        data: {
          stationId: shift.stationId,
          fuelType: sale.fuelType,
          movementType: 'sale',
          quantity: -sale.liters,
          sourceRef: id,
          movementDate: shift.shiftDate,
          createdBy: user.id,
        },
      })
      await db.inventoryBalance.upsert({
        where: { stationId_fuelType: { stationId: shift.stationId, fuelType: sale.fuelType } },
        update: { estimatedStock: { decrement: sale.liters } },
        create: {
          stationId: shift.stationId,
          fuelType: sale.fuelType,
          estimatedStock: -sale.liters,
        },
      })
    }

    for (const advance of advances) {
      await db.dispenser.update({
        where: { id: advance.dispenserId },
        data: {
          ...(advance.newElectronicReading !== null && {
            lastElectronicReading: advance.newElectronicReading,
          }),
          ...(advance.newMechanicalReading !== null && {
            lastMechanicalReading: advance.newMechanicalReading,
          }),
          lastReadingAt: new Date(),
        },
      })
    }

    return shiftRow
  })

  await writeAudit({
    userId: user.id,
    action: 'shift.complete',
    entity: 'shift',
    entityId: id,
    metadata: { sales },
  })
  return ok(updated)
}
