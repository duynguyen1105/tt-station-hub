import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { checkAmountMatch } from '@/lib/ai/extract-visit'
import { badRequest, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'

const correctSchema = z.object({
  plateConfirmed: z.string().nullable().optional(),
  litersRead: z.number().nullable().optional(),
  unitPriceRead: z.number().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  fuelType: z.enum(['DO', 'E0', 'DC', 'XANG_A95', 'URE']).nullable().optional(),
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
  if (parsed.data.fuelType !== undefined) data.fuelType = parsed.data.fuelType
  if (parsed.data.litersRead !== undefined) data.litersRead = parsed.data.litersRead
  if (parsed.data.unitPriceRead !== undefined) data.unitPriceRead = parsed.data.unitPriceRead
  if (parsed.data.stationId !== undefined) {
    const station = await prisma.station.findFirst({
      where: { id: parsed.data.stationId, isActive: true },
      select: { id: true },
    })
    if (!station) return badRequest('Trạm không hợp lệ.')
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
