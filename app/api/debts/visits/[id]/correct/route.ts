import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { checkAmountMatch } from '@/lib/ai/extract-visit'
import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { nextAmountFields, refuseAmountOverride } from '@/lib/debts/visit-amount'
import { stationFuelRefusal } from '@/lib/fuels/load-catalogue'
import { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'

const correctSchema = z.object({
  plateConfirmed: z.string().nullable().optional(),
  litersRead: z.number().nullable().optional(),
  unitPriceRead: z.number().nullable().optional(),
  // The thành tiền the reviewer typed; null puts the lượt xe back on số lít × đơn giá.
  amountOverride: z.number().nullable().optional(),
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

  const num = (d: Prisma.Decimal | null) => (d !== null ? Number(d) : null)
  // `undefined` (field absent — the trạm ô chọn posts only a stationId) and `null`
  // (box cleared) mean different things, so the merge is handed the parsed patch as-is.
  const amounts = nextAmountFields(
    {
      litersRead: num(visit.litersRead),
      unitPriceRead: num(visit.unitPriceRead),
      amountOverride: num(visit.amountOverride),
      originalLitersRead: num(visit.originalLitersRead),
      originalUnitPriceRead: num(visit.originalUnitPriceRead),
    },
    {
      litersRead: parsed.data.litersRead,
      unitPriceRead: parsed.data.unitPriceRead,
      amountOverride: parsed.data.amountOverride,
    }
  )
  const amountRefusal = refuseAmountOverride(amounts)
  if (amountRefusal) return badRequest(amountRefusal)

  const displayed = visit.displayedAmount !== null ? visit.displayedAmount.toString() : null
  const { computedAmount } = amounts
  // Khớp/Lệch keeps comparing the *derived* amount against the pump display: it is a
  // statement about what the AI read, which a typed thành tiền does not change.
  const matchesDisplay =
    computedAmount !== null ? checkAmountMatch(computedAmount, displayed) : null

  const data: Prisma.DebtVehicleVisitUpdateInput = {
    reviewStatus: 'corrected',
    reviewedBy: user.id,
    reviewedAt: new Date(),
    computedAmount,
    amountMatchesDisplay: matchesDisplay,
    litersRead: amounts.litersRead,
    unitPriceRead: amounts.unitPriceRead,
    amountOverride: amounts.amountOverride,
    // "Lệch số tiền" asks a human to look; a reviewer who has typed the thành tiền, or
    // whose corrected figures now reconcile, has looked. No other reason is ever set.
    anomalyReasons:
      amounts.amountOverride !== null || matchesDisplay !== false
        ? visit.anomalyReasons.filter((r) => r !== 'amount_mismatch')
        : visit.anomalyReasons,
  }
  if (amounts.originalLitersRead !== undefined) {
    data.originalLitersRead = amounts.originalLitersRead
  }
  if (amounts.originalUnitPriceRead !== undefined) {
    data.originalUnitPriceRead = amounts.originalUnitPriceRead
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
    // The patch alone says what was written but not what it displaced, and once the
    // original* columns are stamped the previous values are unrecoverable from the row.
    metadata: {
      ...parsed.data,
      previous: {
        litersRead: num(visit.litersRead),
        unitPriceRead: num(visit.unitPriceRead),
        amountOverride: num(visit.amountOverride),
        computedAmount: num(visit.computedAmount),
      },
    },
  })
  return ok(updated)
}
