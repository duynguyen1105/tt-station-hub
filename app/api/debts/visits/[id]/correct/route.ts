import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { checkAmountMatch } from '@/lib/ai/extract-visit'
import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { stationFuelRefusal } from '@/lib/fuels/load-catalogue'
import { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'

const correctSchema = z.object({
  plateConfirmed: z.string().nullable().optional(),
  litersRead: z.number().nullable().optional(),
  unitPriceRead: z.number().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  // Any khóa, checked below against what the trạm sells rather than frozen here: the ô
  // chọn offers whatever that trạm has declared, so a nhiên liệu it took on this morning
  // must be correctable to on the same day.
  fuelType: z.string().min(1).nullable().optional(),
  // Reviewer can re-assign the visit when the AI could not (or wrongly) determine
  // the station from the pump plate.
  stationId: z.string().uuid().optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params

  const parsed = correctSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())

  const visit = await prisma.debtVehicleVisit.findUnique({ where: { id } })
  if (!visit) return notFound()
  if (!(await canReachStation(user, visit.stationId))) return forbidden()

  const liters =
    parsed.data.litersRead ?? (visit.litersRead !== null ? Number(visit.litersRead) : null)
  const unitPrice =
    parsed.data.unitPriceRead ?? (visit.unitPriceRead !== null ? Number(visit.unitPriceRead) : null)
  const computedAmount =
    liters !== null && unitPrice !== null ? Math.round(liters * unitPrice) : null
  const displayed = visit.displayedAmount !== null ? visit.displayedAmount.toString() : null

  const data: Prisma.DebtVehicleVisitUpdateInput = {
    reviewStatus: 'corrected',
    reviewedBy: user.id,
    reviewedAt: new Date(),
    computedAmount,
    amountMatchesDisplay:
      computedAmount !== null ? checkAmountMatch(computedAmount, displayed) : null,
  }
  if (parsed.data.plateConfirmed !== undefined) data.plateConfirmed = parsed.data.plateConfirmed
  if (parsed.data.customerId !== undefined) data.customerId = parsed.data.customerId
  if (parsed.data.fuelType !== undefined) {
    // Only a nhiên liệu the reviewer is actually *changing* is held to what the trạm
    // sells — narrowing governs what may be chosen now, never what an old lượt xe
    // already carries. Re-sending the fuel a visit was read with, at a trạm that has
    // since stopped selling it, is not a choice, and refusing it would make the visit
    // uncorrectable in every other field too.
    //
    // Checked against the trạm the lượt xe ends up at, which is the one this request
    // moves it to where it moves it at all. What a trạm sells is drawn from the danh
    // mục, so this also turns away a khóa that is unknown or đã ngừng: neither can be
    // among what any trạm sells.
    if (parsed.data.fuelType !== null && parsed.data.fuelType !== visit.fuelType) {
      const refusal = await stationFuelRefusal(
        parsed.data.stationId ?? visit.stationId,
        parsed.data.fuelType
      )
      if (refusal) return badRequest(refusal)
    }
    data.fuelType = parsed.data.fuelType
  }
  if (parsed.data.litersRead !== undefined) data.litersRead = parsed.data.litersRead
  if (parsed.data.unitPriceRead !== undefined) data.unitPriceRead = parsed.data.unitPriceRead
  if (parsed.data.stationId !== undefined) {
    const station = await prisma.station.findFirst({
      where: { id: parsed.data.stationId, isActive: true },
      select: { id: true },
    })
    if (!station) return badRequest('Trạm không hợp lệ.')
    // Re-assigning the lượt xe is a write into the trạm it lands in, so the
    // destination is held to the same boundary as the trạm it came from.
    if (!(await canReachStation(user, station.id))) return forbidden()
    data.stationId = station.id
  }

  const updated = await prisma.debtVehicleVisit.update({ where: { id }, data })
  await writeAudit({
    userId: user.id,
    action: 'debt_visit.correct',
    entity: 'debt_vehicle_visit',
    entityId: id,
    metadata: parsed.data,
  })
  return ok(updated)
}
