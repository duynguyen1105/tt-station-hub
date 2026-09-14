import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, created, forbidden, notFound, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { hasRole } from '@/lib/auth/permissions'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { tankCodeFor, tankNameFor } from '@/lib/dispensers/naming'
import { stationFuelRefusal } from '@/lib/fuels/load-catalogue'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

const createSchema = z.object({
  // The số hầm printed on the biên bản; no trạm has three digits of them.
  tankNumber: z.number().int().min(1).max(99),
  fuelType: z.string().trim().min(1),
  // Thousands of litres, the way the column stores it — 25 is a 25,000 L hầm.
  capacityK: z.number().int().min(1).max(1000).nullable(),
})

/**
 * Tạo một hầm. The số hầm generates the code đo hầm and phiếu nhập name it by, and
 * the nhiên liệu is narrowed to what the trạm declared it sells — the same rule a trụ
 * with no hầm keeps.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!hasRole(user.role, ['admin', 'accountant'])) return forbidden()
  const { id: stationId } = await params

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  const { tankNumber, fuelType, capacityK } = parsed.data

  const station = await prisma.station.findUnique({ where: { id: stationId } })
  if (!station) return notFound()
  if (!(await canReachStation(user, station.id))) return forbidden()

  const notSold = await stationFuelRefusal(stationId, fuelType)
  if (notSold) return badRequest(notSold)

  // Checked here for the tên the refusal names; the unique index on (station, code)
  // is what actually holds the line.
  const code = tankCodeFor(tankNumber)
  const taken = await prisma.tank.findUnique({
    where: { stationId_code: { stationId, code } },
    select: { id: true },
  })
  if (taken) return badRequest(vi.tanks.numberTaken(tankNameFor(code)))

  const tank = await prisma.tank.create({ data: { stationId, code, fuelType, capacityK } })

  await writeAudit({
    userId: user.id,
    action: 'tank.create',
    entity: 'tank',
    entityId: tank.id,
    metadata: { stationId, ...parsed.data, code },
  })
  return created(tank)
}
