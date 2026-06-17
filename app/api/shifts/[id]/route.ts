import { notFound, ok, unauthorized } from '@/lib/api/response'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params

  const shift = await prisma.shift.findUnique({ where: { id } })
  if (!shift) return notFound()

  const [readings, dispensers] = await Promise.all([
    prisma.shiftReading.findMany({ where: { shiftId: id } }),
    prisma.dispenser.findMany({
      where: { stationId: shift.stationId, isActive: true },
      orderBy: { displayOrder: 'asc' },
    }),
  ])

  return ok({ shift, readings, dispensers })
}
