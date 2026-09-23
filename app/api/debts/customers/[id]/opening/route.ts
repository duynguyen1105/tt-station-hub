import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { canEditOpening } from '@/lib/auth/reading-policy'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { dayKeyOf } from '@/lib/debts/ledger'
import { shiftDateFor } from '@/lib/photos/ingest'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

const bodySchema = z.object({
  // Negative is allowed: a khách who prepaid.
  openingBalance: z.number().int(),
  openingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

/**
 * Sets a khách hàng's nợ đầu kỳ and the day it applies from — the anchor their sổ
 * công nợ counts from. ADMIN ONLY, audited with the previous value.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!canEditOpening(user.role)) return forbidden()
  const { id } = await params

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  const { openingBalance, openingDate } = parsed.data

  const customer = await prisma.debtCustomer.findUnique({ where: { id } })
  if (!customer) return notFound()
  if (customer.stationId && !(await canReachStation(user, customer.stationId))) return forbidden()
  if (openingDate > dayKeyOf(shiftDateFor(Date.now()))) return badRequest(vi.debts.openingFuture)

  await prisma.debtCustomer.update({
    where: { id },
    data: { openingBalance, openingDate: new Date(`${openingDate}T00:00:00.000Z`) },
  })

  await writeAudit({
    userId: user.id,
    action: 'debt.customer.opening.set',
    entity: 'debt_customer',
    entityId: id,
    metadata: {
      openingBalance,
      openingDate,
      previous: {
        openingBalance: Number(customer.openingBalance),
        openingDate: customer.openingDate ? dayKeyOf(customer.openingDate) : null,
      },
    },
  })
  return ok({ id })
}
