import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { hasRole } from '@/lib/auth/permissions'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

// The same two fields the Thêm dialog asks for, and deliberately not the khóa: every
// giá, tồn kho, trụ and past ca on disk is keyed by it, so a correction to the tên has
// to leave it exactly where it is.
const updateFuelSchema = z.object({
  name: z.string().trim().min(1, vi.misaSettings.fuelNameRequired),
  areaIndependent: z.boolean(),
})

/**
 * Corrects a nhiên liệu's tên and whether it is priced once for the whole nước.
 *
 * Addressed by khóa rather than by row id: it is unique, it never moves, and it is the
 * string every other table already holds — so the board can offer Sửa without carrying
 * a second identifier for the same nhiên liệu.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ fuelType: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!hasRole(user.role, ['admin', 'accountant'])) return forbidden()
  const { fuelType } = await params

  const parsed = updateFuelSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const named = parsed.error.issues.find((issue) => issue.path.length > 0)?.message
    return badRequest(named, parsed.error.flatten())
  }
  const { name, areaIndependent } = parsed.data

  const before = await prisma.fuel.findUnique({ where: { fuelType } })
  if (!before) return notFound()

  const fuel = await prisma.fuel.update({ where: { fuelType }, data: { name, areaIndependent } })
  await writeAudit({
    userId: user.id,
    action: 'misa.fuel.update',
    entity: 'fuel',
    entityId: fuel.id,
    // Both sides, because the point of auditing a correction is what it corrected.
    metadata: {
      fuelType,
      from: { name: before.name, areaIndependent: before.areaIndependent },
      to: { name: fuel.name, areaIndependent: fuel.areaIndependent },
    },
  })
  return ok(fuel)
}
