import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, created, forbidden, notFound, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { hasRole } from '@/lib/auth/permissions'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { dispenserCodeFor, dispenserNameFor } from '@/lib/dispensers/naming'
import { noTankFieldsFor, refuseDispenserShape, tankFieldsFor } from '@/lib/dispensers/rules'
import { stationFuelRefusal } from '@/lib/fuels/load-catalogue'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

const createSchema = z.object({
  // A số trụ is what is painted on the biển; no trạm has three digits of them.
  pumpNumber: z.number().int().min(1).max(99),
  // The hầm it draws from, whose nhiên liệu it pumps. Only a trụ with no hầm (URE)
  // names a nhiên liệu of its own; alongside a hầm, fuelType is not read.
  tankId: z.string().uuid().nullable(),
  fuelType: z.string().trim().min(1).nullable(),
  hasElectronicMeter: z.boolean(),
  hasMechanicalMeter: z.boolean(),
})

/**
 * Lắp một trụ. The số trụ is the only identifier asked for: it generates both the code
 * the photo matcher resolves a biển to and the tên every screen shows, so a trạm and a
 * photo cannot end up on two naming schemes.
 *
 * A trụ drawing from a hầm pumps the hầm's nhiên liệu. A trụ with no hầm names its own,
 * narrowed to what the trạm declared it sells — the same rule the picker draws — so a
 * trụ can never pump something the trạm has no mã hàng and no giá for.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!hasRole(user.role, ['admin', 'accountant'])) return forbidden()
  const { id: stationId } = await params

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  const { pumpNumber, tankId, fuelType, ...meters } = parsed.data
  const refusal = refuseDispenserShape(meters)
  if (refusal) return badRequest(refusal)

  const station = await prisma.station.findUnique({ where: { id: stationId } })
  if (!station) return notFound()
  if (!(await canReachStation(user, station.id))) return forbidden()

  let supply
  if (tankId !== null) {
    const tank = await prisma.tank.findFirst({ where: { id: tankId, stationId } })
    if (!tank) return badRequest(vi.dispensers.notStationTank)
    supply = tankFieldsFor(tank)
  } else {
    if (fuelType === null) return badRequest(vi.dispensers.fuelRequired)
    const notSold = await stationFuelRefusal(stationId, fuelType)
    if (notSold) return badRequest(notSold)
    supply = noTankFieldsFor(fuelType)
  }

  // One số trụ per trạm: the code is what a photo matches on, so two trụ sharing one
  // would make every plate ambiguous. Checked here for the tên the refusal names; the
  // unique index on (station, code) is what actually holds the line.
  const code = dispenserCodeFor(pumpNumber)
  const taken = await prisma.dispenser.findUnique({
    where: { stationId_code: { stationId, code } },
    select: { displayName: true },
  })
  if (taken) return badRequest(vi.dispensers.numberTaken(taken.displayName))

  const dispenser = await prisma.dispenser.create({
    data: {
      stationId,
      code,
      displayName: dispenserNameFor(pumpNumber),
      ...supply,
      ...meters,
      // The số trụ is the order a trạm reads its trụ in, on screen and on paper.
      displayOrder: pumpNumber,
    },
  })

  await writeAudit({
    userId: user.id,
    action: 'dispenser.create',
    entity: 'dispenser',
    entityId: dispenser.id,
    metadata: { stationId, ...parsed.data, ...supply, code },
  })
  return created(dispenser)
}
