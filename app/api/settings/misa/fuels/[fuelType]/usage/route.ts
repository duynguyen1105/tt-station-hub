import { forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { hasRole } from '@/lib/auth/permissions'
import { getCurrentUser } from '@/lib/auth/session'
import { decideFuelRemoval } from '@/lib/fuels/catalogue'
import { countFuelUsage } from '@/lib/fuels/usage'
import { prisma } from '@/lib/prisma'

/**
 * What pressing Xoá on this nhiên liệu would do — the question the dialog asks before
 * it shows kế toán a button. Either "nothing uses it, it can go", or the list of what
 * is holding it, which turns the dialog into Ngừng sử dụng.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ fuelType: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!hasRole(user.role, ['admin', 'accountant'])) return forbidden()
  const { fuelType } = await params

  const fuel = await prisma.fuel.findUnique({ where: { fuelType } })
  if (!fuel) return notFound()

  return ok(decideFuelRemoval(await countFuelUsage(fuelType)))
}
