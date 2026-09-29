import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { hasRole } from '@/lib/auth/permissions'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

const updateSchema = z.object({
  // Required by Trường Thịnh — can be changed but not cleared; "bl" is reserved
  // for retail (cash) sales in the MISA export.
  misaCode: z
    .string()
    .trim()
    .min(1)
    .refine((c) => c.toLowerCase() !== 'bl', 'Mã "bl" dành riêng cho bán lẻ.')
    .optional(),
  name: z.string().trim().min(1).optional(),
  phone: z.string().trim().nullable().optional(),
  knownPlates: z.array(z.string().trim().min(1)).optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!hasRole(user.role, ['admin', 'accountant'])) return forbidden()
  const { id } = await params

  const parsed = updateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())

  const customer = await prisma.debtCustomer.findUnique({ where: { id } })
  if (!customer) return notFound()
  if (customer.stationId && !(await canReachStation(user, customer.stationId))) {
    return forbidden()
  }

  const { misaCode, name, phone, knownPlates } = parsed.data
  const updated = await prisma.debtCustomer.update({
    where: { id },
    data: {
      ...(misaCode !== undefined ? { misaCode } : {}),
      ...(name !== undefined ? { name } : {}),
      ...(phone !== undefined ? { phone: phone || null } : {}),
      ...(knownPlates !== undefined
        ? { knownPlates: knownPlates.map((p) => p.toUpperCase()) }
        : {}),
    },
  })

  await writeAudit({
    userId: user.id,
    action: 'debt.customer.update',
    entity: 'debt_customer',
    entityId: id,
    metadata: parsed.data,
  })
  return ok(updated)
}

/**
 * Deletes a khách hàng created by mistake (a typo, a duplicate). Admin only, and only
 * while nothing points at them — a giao dịch, a lượt xe or a Thu chi row is history the
 * sổ công nợ reads, so such a khách is renamed instead. Audited with the whole row.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()
  const { id } = await params

  const customer = await prisma.debtCustomer.findUnique({ where: { id } })
  if (!customer) return notFound()
  if (customer.stationId && !(await canReachStation(user, customer.stationId))) {
    return forbidden()
  }

  const refusal = await prisma.$transaction(async (db) => {
    const [tx, visits, cash] = await Promise.all([
      db.debtTransaction.count({ where: { customerId: id } }),
      db.debtVehicleVisit.count({ where: { customerId: id } }),
      db.shiftCashEntry.count({ where: { customerId: id } }),
    ])
    if (tx + visits + cash > 0) return vi.debtReview.customerInUse(tx, visits, cash)
    await db.debtCustomer.delete({ where: { id } })
    await writeAudit(
      {
        userId: user.id,
        action: 'debt.customer.delete',
        entity: 'debt_customer',
        entityId: id,
        metadata: {
          name: customer.name,
          misaCode: customer.misaCode,
          stationId: customer.stationId,
          knownPlates: customer.knownPlates,
          openingBalance: customer.openingBalance.toString(),
          openingDate: customer.openingDate?.toISOString().slice(0, 10) ?? null,
        },
      },
      db
    )
    return null
  })
  return refusal ? badRequest(refusal) : ok({ id })
}
