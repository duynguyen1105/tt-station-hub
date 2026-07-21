import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { hasRole } from '@/lib/auth/permissions'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'

const createSchema = z.object({
  name: z.string().trim().min(1),
  stationId: z.string().uuid().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  // Customer code is assigned by Trường Thịnh and required; "bl" is reserved for
  // retail (cash) sales in the MISA export and must not be a debt customer.
  misaCode: z
    .string()
    .trim()
    .min(1)
    .refine((c) => c.toLowerCase() !== 'bl', 'Mã "bl" dành riêng cho bán lẻ.'),
  knownPlates: z.array(z.string().trim().min(1)).optional(),
})

/** Creates a debt customer (e.g. inline from the review screen for a walk-in). */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!hasRole(user.role, ['admin', 'accountant'])) return forbidden()

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())

  const { name, stationId, phone, misaCode, knownPlates } = parsed.data
  const customer = await prisma.debtCustomer.create({
    data: {
      name,
      stationId: stationId ?? null,
      phone: phone || null,
      misaCode,
      knownPlates: (knownPlates ?? []).map((p) => p.toUpperCase()),
    },
  })

  await writeAudit({
    userId: user.id,
    action: 'debt.customer.create',
    entity: 'debt_customer',
    entityId: customer.id,
    metadata: { name, stationId: stationId ?? null },
  })
  return ok(customer)
}
