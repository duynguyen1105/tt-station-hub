import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { prisma } from '@/lib/prisma'
import { reversedShiftSales } from '@/lib/shifts/completion'
import { vi } from '@/messages/vi'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()
  const { id } = await params
  const shift = await prisma.shift.findUnique({ where: { id } })
  if (!shift) return notFound()
  if (!(await canReachStation(user, shift.stationId))) return forbidden()
  if (shift.status !== 'completed') return badRequest(vi.shifts.notCompleted)

  const reopened = await prisma.$transaction(
    async (db) => {
      // Updating the shift first serializes competing reopen attempts and completion.
      const claimed = await db.shift.updateMany({
        where: { id, status: 'completed' },
        data: { status: 'pending_review', completedAt: null, reviewedBy: null },
      })
      if (claimed.count !== 1) return null

      const movements = await db.inventoryMovement.findMany({
        where: { stationId: shift.stationId, movementType: 'sale', sourceRef: id },
        select: { fuelType: true, quantity: true },
      })
      const reversals = reversedShiftSales(movements)
      for (const { fuelType, liters } of reversals) {
        const balance = await db.inventoryBalance.updateMany({
          where: { stationId: shift.stationId, fuelType },
          data: { estimatedStock: { increment: liters } },
        })
        if (balance.count !== 1) throw new Error(`Missing inventory balance for ${fuelType}`)
      }
      await db.inventoryMovement.deleteMany({
        where: { stationId: shift.stationId, movementType: 'sale', sourceRef: id },
      })
      // Dispenser caches are the latest approved meter values, not inventory postings:
      // the approved readings remain approved. A later correction refreshes them via
      // propagateApprovedClosing. Upload/review counters likewise are unchanged.
      await writeAudit(
        {
          userId: user.id,
          action: 'shift.reopen',
          entity: 'shift',
          entityId: id,
          metadata: {
            from: { status: 'completed', completedAt: shift.completedAt?.toISOString() ?? null },
            to: { status: 'pending_review', completedAt: null },
            reversedSales: reversals.map(({ fuelType, liters }) => ({
              fuelType,
              liters: liters.toString(),
            })),
          },
        },
        db
      )
      return db.shift.findUniqueOrThrow({ where: { id } })
    },
    { timeout: 15000 }
  )
  return reopened ? ok(reopened) : badRequest(vi.shifts.notCompleted)
}
