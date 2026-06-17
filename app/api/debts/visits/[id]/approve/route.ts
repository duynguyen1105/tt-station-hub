import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'

const approveSchema = z.object({ customerId: z.string().uuid().optional() })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params

  const parsed = approveSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())

  const visit = await prisma.debtVehicleVisit.findUnique({ where: { id } })
  if (!visit) return notFound()

  const customerId = parsed.data.customerId ?? visit.customerId
  if (!customerId) return badRequest('Chưa gán khách hàng cho lượt xe này.')
  if (visit.computedAmount === null) return badRequest('Chưa có thành tiền để ghi nợ.')
  const amount = Number(visit.computedAmount)

  // Approving a visit charges the customer's debt ledger.
  const updated = await prisma.$transaction(async (db) => {
    const v = await db.debtVehicleVisit.update({
      where: { id },
      data: { reviewStatus: 'approved', reviewedBy: user.id, reviewedAt: new Date(), customerId },
    })
    await db.debtTransaction.create({
      data: {
        customerId,
        txType: 'charge',
        amount,
        sourceRef: id,
        txDate: visit.visitDate,
        createdBy: user.id,
      },
    })
    await db.debtCustomer.update({
      where: { id: customerId },
      data: { currentBalance: { increment: amount } },
    })
    return v
  })

  await writeAudit({
    userId: user.id,
    action: 'debt_visit.approve',
    entity: 'debt_vehicle_visit',
    entityId: id,
    metadata: { customerId, amount },
  })
  return ok(updated)
}
