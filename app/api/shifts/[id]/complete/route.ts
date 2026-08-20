import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { type ShiftStatus, canReviewShift } from '@/lib/auth/reading-policy'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { computeShiftSales } from '@/lib/inventory/shift-sales'
import { prisma } from '@/lib/prisma'
import { isApprovedReading, refuseShiftCompletion } from '@/lib/shifts/completion'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params

  const shift = await prisma.shift.findUnique({ where: { id } })
  if (!shift) return notFound()
  // Chốt is the closing decision the queue is asking for; it is refused for a
  // trạm the person does not hold, like the approvals that lead up to it.
  if (!(await canReachStation(user, shift.stationId))) return forbidden()
  if (!canReviewShift(user.role, shift.status as ShiftStatus)) return forbidden()
  if (shift.status === 'completed') return badRequest('Ca này đã được chốt.')

  // Chốt stands on số liệu: none that counts, or any still awaiting duyệt, refuses it —
  // the same rule the disabled Chốt ca button on the ca page reads.
  const [allReadings, dispensers] = await Promise.all([
    prisma.shiftReading.findMany({ where: { shiftId: id } }),
    prisma.dispenser.findMany({ where: { stationId: shift.stationId } }),
  ])
  const refusal = refuseShiftCompletion(allReadings)
  if (refusal) return badRequest(refusal)

  // Approved readings drive the inventory deduction (sold liters per fuel type).
  const readings = allReadings.filter(isApprovedReading)

  const { sales, advances } = computeShiftSales(
    readings.map((r) => ({
      dispenserId: r.dispenserId,
      fuelType: r.fuelType,
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
