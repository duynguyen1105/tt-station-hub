import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { hasRole } from '@/lib/auth/permissions'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'

const activeSchema = z.object({ isActive: z.boolean() })

/**
 * Ngừng sử dụng and Dùng lại. The one field it writes is the nhiên liệu's own active
 * flag — no giá, tồn kho, phiếu nhập or công nợ row is touched, which is exactly what
 * makes ngừng safe where xoá is not: the history keeps rendering its tên from this row,
 * and Dùng lại brings it back with its lịch sử giá untouched.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ fuelType: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!hasRole(user.role, ['admin', 'accountant'])) return forbidden()
  const { fuelType } = await params

  const parsed = activeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  const { isActive } = parsed.data

  const before = await prisma.fuel.findUnique({ where: { fuelType } })
  if (!before) return notFound()

  const fuel = await prisma.fuel.update({ where: { fuelType }, data: { isActive } })
  await writeAudit({
    userId: user.id,
    action: isActive ? 'misa.fuel.reactivate' : 'misa.fuel.deactivate',
    entity: 'fuel',
    entityId: fuel.id,
    metadata: { fuelType, name: fuel.name },
  })
  return ok(fuel)
}
