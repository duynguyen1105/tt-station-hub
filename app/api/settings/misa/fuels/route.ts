import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, created, forbidden, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { hasRole } from '@/lib/auth/permissions'
import { getCurrentUser } from '@/lib/auth/session'
import { generateFuelType } from '@/lib/fuels/catalogue'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

// A nhiên liệu is a tên and whether it is priced once for the whole nước. The khóa is
// not asked for: it is generated from the tên and frozen from then on, so kế toán
// never type one and never see one.
const fuelSchema = z.object({
  name: z.string().trim().min(1, vi.misaSettings.fuelNameRequired),
  areaIndependent: z.boolean(),
})

/** Adds a nhiên liệu to the danh mục. Admin and kế toán, as the MISA settings area. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!hasRole(user.role, ['admin', 'accountant'])) return forbidden()

  const parsed = fuelSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const named = parsed.error.issues.find((issue) => issue.path.length > 0)?.message
    return badRequest(named, parsed.error.flatten())
  }
  const { name, areaIndependent } = parsed.data

  // A tên of nothing but punctuation generates an empty khóa, which no row may carry.
  const fuelType = generateFuelType(name)
  if (fuelType === '') return badRequest(vi.misaSettings.fuelNameRequired)

  // The clash is on the khóa, not the tên, so the refusal names the nhiên liệu that
  // already holds it — otherwise "Xăng RON 98" and "Xăng RON-98" would be refused with
  // no sign of which existing row is in the way.
  const clash = await prisma.fuel.findUnique({ where: { fuelType } })
  if (clash) return badRequest(vi.misaSettings.fuelNameTaken(clash.name))

  const fuel = await prisma.fuel.create({ data: { fuelType, name, areaIndependent } })
  await writeAudit({
    userId: user.id,
    action: 'misa.fuel.create',
    entity: 'fuel',
    entityId: fuel.id,
    metadata: { fuelType, name, areaIndependent },
  })
  return created(fuel)
}
