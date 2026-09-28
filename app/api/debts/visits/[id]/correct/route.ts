import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { checkAmountMatch } from '@/lib/ai/extract-visit'
import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { priceMismatchOf } from '@/lib/debts/board-price'
import { dayKeyOf } from '@/lib/debts/ledger'
import { loadStationPrices } from '@/lib/debts/load-board-prices'
import { chargeAmountOf, nextAmountFields, refuseAmountOverride } from '@/lib/debts/visit-amount'
import { canEditDebtVisit, debtVisitDecision } from '@/lib/debts/visit-review'
import { formatDate } from '@/lib/format'
import { stationFuelRefusal } from '@/lib/fuels/load-catalogue'
import { Prisma } from '@/lib/generated/prisma/client'
import {
  findOrCreateShift,
  photoDateMismatch,
  shiftDateFor,
  shiftTypeFor,
} from '@/lib/photos/ingest'
import { uploadTimestamp } from '@/lib/photos/upload'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

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
  // The ngày bán (YYYY-MM-DD, GMT+7) when the lượt xe was uploaded on a later ngày than it
  // sold — the ngày printed on its ảnh. Moves it to that ngày's ca, and its charge with it.
  visitDay: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  // Người xem only reads.
  if (user.role === 'viewer') return forbidden()
  const { id } = await params

  const parsed = correctSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())

  const visit = await prisma.debtVehicleVisit.findUnique({ where: { id } })
  if (!visit) return notFound()
  if (!(await canReachStation(user, visit.stationId))) return forbidden()
  if (!canEditDebtVisit(user.role, visit.reviewStatus)) return forbidden()

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
  const decision = debtVisitDecision(visit.reviewStatus, 'correct')!

  // A new ngày bán is stamped the way Tải ảnh stamps a tải bù (uploadTimestamp): today at
  // the moment, an earlier ngày at its last instant, a future ngày refused.
  const moveTo =
    parsed.data.visitDay !== undefined &&
    parsed.data.visitDay !== dayKeyOf(shiftDateFor(visit.visitDate.getTime()))
      ? uploadTimestamp(parsed.data.visitDay, Date.now())
      : undefined
  if (moveTo === null) return badRequest(vi.upload.badDay)
  const visitDate = moveTo === undefined ? visit.visitDate : new Date(moveTo)
  if (moveTo !== undefined) {
    // Both ca's Tổng nợ and MISA file change, so neither may be chốt'd.
    // ponytail: checked before the write, not under the ca lock — a Chốt ca landing in the
    // same instant could slip past; lockShift both ca if that is ever seen.
    const closed = await prisma.shift.findFirst({
      where: {
        status: 'completed',
        shiftType: shiftTypeFor(),
        OR: [
          { stationId: visit.stationId, shiftDate: shiftDateFor(visit.visitDate.getTime()) },
          { stationId: parsed.data.stationId ?? visit.stationId, shiftDate: shiftDateFor(moveTo) },
        ],
      },
      select: { shiftDate: true },
    })
    if (closed) return badRequest(vi.debtReview.dayShiftClosed(formatDate(closed.shiftDate)))
  }
  const customerId =
    parsed.data.customerId !== undefined ? parsed.data.customerId : visit.customerId
  const charge = decision.charge === 'update' ? chargeAmountOf(amounts) : null
  if (decision.charge === 'update' && !customerId) return badRequest(vi.debtReview.needCustomer)
  if (decision.charge === 'update' && charge === null) return badRequest(vi.debtReview.needAmount)

  const displayed = visit.displayedAmount !== null ? visit.displayedAmount.toString() : null
  const { computedAmount } = amounts
  // Khớp/Lệch keeps comparing the *derived* amount against the pump display: it is a
  // statement about what the AI read, which a typed thành tiền does not change.
  const matchesDisplay =
    computedAmount !== null
      ? checkAmountMatch(computedAmount, displayed, amounts.unitPriceRead)
      : null

  // "Đơn giá lệch bảng giá" is re-asked of what this save leaves behind — the đơn giá,
  // nhiên liệu and trạm may all have moved — so typing the bảng giá price clears it and
  // picking a nhiên liệu priced differently raises it. The đơn giá itself is never touched.
  const priceMismatch = priceMismatchOf(
    await loadStationPrices(parsed.data.stationId ?? visit.stationId),
    parsed.data.fuelType !== undefined ? parsed.data.fuelType : visit.fuelType,
    visitDate,
    amounts.unitPriceRead
  )
  const keptReasons = visit.anomalyReasons.filter(
    (r) =>
      r !== 'price_mismatch' &&
      // A moved ngày bán is re-checked against the ngày on the ảnh below.
      (r !== 'photo_date_mismatch' || moveTo === undefined) &&
      // "Lệch số tiền" asks a human to look; a reviewer who has typed the thành tiền, or
      // whose corrected figures now reconcile, has looked.
      (r !== 'amount_mismatch' || (amounts.amountOverride === null && matchesDisplay === false))
  )
  if (
    moveTo !== undefined &&
    visit.photoDate &&
    photoDateMismatch(dayKeyOf(visit.photoDate), visitDate)
  ) {
    keptReasons.push('photo_date_mismatch')
  }

  const data: Prisma.DebtVehicleVisitUpdateInput = {
    reviewStatus: decision.reviewStatus,
    reviewedBy: user.id,
    reviewedAt: new Date(),
    computedAmount,
    amountMatchesDisplay: matchesDisplay,
    litersRead: amounts.litersRead,
    unitPriceRead: amounts.unitPriceRead,
    amountOverride: amounts.amountOverride,
    anomalyReasons: priceMismatch ? [...keptReasons, 'price_mismatch'] : keptReasons,
  }
  if (moveTo !== undefined) data.visitDate = visitDate
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

  let updated
  try {
    updated = await prisma.$transaction(async (db) => {
      const changed = await db.debtVehicleVisit.updateMany({
        where: { id, reviewStatus: visit.reviewStatus, reviewedAt: visit.reviewedAt },
        data,
      })
      if (changed.count !== 1) throw new Error('stale')
      if (decision.charge === 'update') {
        const posted = await db.debtTransaction.updateMany({
          where: { sourceRef: id, txType: 'charge' },
          data: {
            amount: charge!,
            customerId: customerId!,
            txDate: shiftDateFor(visitDate.getTime()),
          },
        })
        if (posted.count !== 1) throw new Error('charge')
      }
      return db.debtVehicleVisit.findUniqueOrThrow({ where: { id } })
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'stale')
      return badRequest(vi.debtReview.changedSinceOpen)
    if (error instanceof Error && error.message === 'charge')
      return badRequest(vi.debtReview.chargeMissing)
    throw error
  }
  // The ngày it moved to may have had no ca yet: open it, as the ngày's first upload
  // would, so the lượt xe lands in a Bán nợ list and a MISA file.
  if (moveTo !== undefined) await findOrCreateShift(updated.stationId, moveTo)
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
        reviewStatus: visit.reviewStatus,
        reviewedBy: visit.reviewedBy,
        reviewedAt: visit.reviewedAt?.toISOString() ?? null,
        customerId: visit.customerId,
        visitDate: visit.visitDate.toISOString(),
        stationId: visit.stationId,
        plateConfirmed: visit.plateConfirmed,
        fuelType: visit.fuelType,
        litersRead: num(visit.litersRead),
        unitPriceRead: num(visit.unitPriceRead),
        amountOverride: num(visit.amountOverride),
        computedAmount: num(visit.computedAmount),
        chargeAmount: chargeAmountOf({
          litersRead: num(visit.litersRead),
          unitPriceRead: num(visit.unitPriceRead),
          amountOverride: num(visit.amountOverride),
        }),
      },
      next: {
        reviewStatus: updated.reviewStatus,
        reviewedBy: updated.reviewedBy,
        reviewedAt: updated.reviewedAt?.toISOString() ?? null,
        customerId: updated.customerId,
        visitDate: updated.visitDate.toISOString(),
        stationId: updated.stationId,
        plateConfirmed: updated.plateConfirmed,
        fuelType: updated.fuelType,
        litersRead: num(updated.litersRead),
        unitPriceRead: num(updated.unitPriceRead),
        amountOverride: num(updated.amountOverride),
        computedAmount: num(updated.computedAmount),
        chargeAmount: chargeAmountOf({
          litersRead: num(updated.litersRead),
          unitPriceRead: num(updated.unitPriceRead),
          amountOverride: num(updated.amountOverride),
        }),
      },
    },
  })
  return ok(updated)
}
