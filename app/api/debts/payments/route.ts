import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, created, notFound, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'

const paymentSchema = z.object({
  customerId: z.string().uuid(),
  amount: z.number().positive(),
  txDate: z.coerce.date(),
  note: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const parsed = paymentSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  const { customerId, amount, txDate, note } = parsed.data

  const customer = await prisma.debtCustomer.findUnique({ where: { id: customerId } })
  if (!customer) return notFound()

  const tx = await prisma.$transaction(async (db) => {
    const payment = await db.debtTransaction.create({
      data: { customerId, txType: 'payment', amount, txDate, note, createdBy: user.id },
    })
    await db.debtCustomer.update({
      where: { id: customerId },
      data: { currentBalance: { decrement: amount } },
    })
    return payment
  })

  await writeAudit({
    userId: user.id,
    action: 'debt.payment',
    entity: 'debt_transaction',
    entityId: tx.id,
    metadata: parsed.data,
  })
  return created(tx)
}
