import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { hasRole } from '@/lib/auth/permissions'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'

const updateSchema = z.object({
  misaCode: z.string().trim().min(1).nullable(),
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

  const updated = await prisma.debtCustomer.update({
    where: { id },
    data: { misaCode: parsed.data.misaCode },
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
