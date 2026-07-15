import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { hasRole } from '@/lib/auth/permissions'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'

const code = z.string().trim().min(1)

const configSchema = z.object({
  revenueAccount: code,
  costAccount: code,
  stockAccount: code,
  creditDebitAccount: code,
  cashDebitAccount: code,
})

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!hasRole(user.role, ['admin', 'accountant'])) return forbidden()

  const parsed = configSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  const values = parsed.data

  const config = await prisma.misaGlobalConfig.upsert({
    where: { id: 'default' },
    update: values,
    create: { id: 'default', ...values },
  })

  await writeAudit({
    userId: user.id,
    action: 'misa.global_config.upsert',
    entity: 'misa_global_config',
    entityId: config.id,
    metadata: parsed.data,
  })
  return ok(config)
}
