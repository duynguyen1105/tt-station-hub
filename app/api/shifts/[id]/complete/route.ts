import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { type ShiftStatus, canReviewShift } from '@/lib/auth/reading-policy'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { computeShiftSales } from '@/lib/inventory/shift-sales'
import { prisma } from '@/lib/prisma'
import { isApprovedReading, refuseShiftCompletion } from '@/lib/shifts/completion'
import { vi } from '@/messages/vi'

class ShiftCompletionRefused extends Error {}

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
  if (shift.status === 'completed') return badRequest(vi.shifts.alreadyCompleted)

  // Claim the ca before reading its numbers. A concurrent Chốt ca, photo intake,
  // or Mở lại ca cannot change the ledger under this transaction.
  const result = await prisma
    .$transaction(
      async (db) => {
        const claimed = await db.shift.updateMany({
          where: { id, status: { not: 'completed' } },
          data: { status: 'completed', completedAt: new Date(), reviewedBy: user.id },
        })
        if (claimed.count !== 1) return { refusal: vi.shifts.alreadyCompleted, updated: null }

        const [allReadings, dispensers] = await Promise.all([
          db.shiftReading.findMany({ where: { shiftId: id } }),
          db.dispenser.findMany({ where: { stationId: shift.stationId } }),
        ])
        const refusal = refuseShiftCompletion(allReadings)
        if (refusal) {
          // Throw so the claimed status rolls back with the refused chốt.
          throw new ShiftCompletionRefused(refusal)
        }
        const { sales, advances } = computeShiftSales(
          allReadings.filter(isApprovedReading).map((r) => ({
            dispenserId: r.dispenserId,
            fuelType: r.fuelType,
            openingElectronicReading:
              r.openingElectronicReading !== null ? Number(r.openingElectronicReading) : null,
            electronicReading: r.electronicReading !== null ? Number(r.electronicReading) : null,
            airPurgeLiters: r.airPurgeLiters !== null ? Number(r.airPurgeLiters) : null,
            openingMechanicalReading:
              r.openingMechanicalReading !== null ? Number(r.openingMechanicalReading) : null,
            mechanicalReading: r.mechanicalReading !== null ? Number(r.mechanicalReading) : null,
          })),
          dispensers.map((d) => ({ id: d.id, fuelType: d.fuelType }))
        )
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
        await writeAudit(
          {
            userId: user.id,
            action: 'shift.complete',
            entity: 'shift',
            entityId: id,
            metadata: { sales },
          },
          db
        )
        return { refusal: null, updated: await db.shift.findUniqueOrThrow({ where: { id } }) }
      },
      { timeout: 15000 }
    )
    .catch((error) => {
      if (error instanceof ShiftCompletionRefused) return { refusal: error.message, updated: null }
      throw error
    })
  return result.updated
    ? ok(result.updated)
    : badRequest(result.refusal ?? vi.shifts.alreadyCompleted)
}
