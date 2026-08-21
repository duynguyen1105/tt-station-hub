import { writeAudit } from '@/lib/auth/audit'
import { type Prisma, type TankDipRecord } from '@/lib/generated/prisma/client'
import { countableDipWhere } from '@/lib/inventory/dip-review'
import { tankIsReserve } from '@/lib/inventory/station-tanks'
import { type ChainSide, planDipRewire } from '@/lib/inventory/tank-dip-rule'
import { prisma } from '@/lib/prisma'

/**
 * The dips either side of a moment within one hầm's chain.
 *
 * Anchored at the corrected row's own measuredAt rather than "the latest", because
 * a correction can land on a dip that is no longer the newest.
 *
 * Two shots of the same dip-stick in one Zalo burst share a measuredAt, so
 * createdAt breaks the tie — and it has to break it the same way on both sides,
 * or the one neighbour would count as both the dip before this one and the dip
 * after it. Strict comparisons on the tie-break also exclude the row itself,
 * which is what lets this be asked of the hầm the dip is leaving.
 */
async function chainAround(dip: TankDipRecord, tankCode: string): Promise<ChainSide> {
  const sameTank = { ...countableDipWhere(dip.stationId), tankCode }
  const [previous, next] = await Promise.all([
    prisma.tankDipRecord.findFirst({
      where: {
        ...sameTank,
        OR: [
          { measuredAt: { lt: dip.measuredAt } },
          { measuredAt: dip.measuredAt, createdAt: { lt: dip.createdAt } },
        ],
      },
      orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.tankDipRecord.findFirst({
      where: {
        ...sameTank,
        OR: [
          { measuredAt: { gt: dip.measuredAt } },
          { measuredAt: dip.measuredAt, createdAt: { gt: dip.createdAt } },
        ],
      },
      orderBy: [{ measuredAt: 'asc' }, { createdAt: 'asc' }],
    }),
  ])
  const reduce = (row: TankDipRecord | null) =>
    row ? { id: row.id, dipValue: Number(row.dipValue), isReserve: row.isReserve } : null
  return { previous: reduce(previous), next: reduce(next) }
}

/**
 * The shared tail of a đo hầm repair: rewrite what the AI misread off the photo,
 * re-derive what it means beside its neighbours, and audit the change. The role
 * gate lives in the route; this helper is reached only after `canCorrectTankDip`
 * passes — same arrangement as `lib/readings/apply-correction.ts` for a ca's chỉ số.
 *
 * The AI reads three things off one hầm plate — the hầm, its nhiên liệu and the
 * số đo — so all three arrive here, each optional, and the caller sends only what
 * a người duyệt actually changed.
 *
 * Up to three rows move. A đo hầm's "So với lần trước" compares it to the dip
 * before it *in the same hầm*, so retyping the number changes this row's delta and
 * the next one's, and moving the row to another hầm changes a third: the hầm it
 * left closes over the gap. `planDipRewire` decides which; see its comment.
 *
 * `reviewStatus` / `reviewedBy` / `reviewedAt` are deliberately left alone.
 * Correcting is not deciding — only a chờ xử lý dip is correctable at all, and it
 * stays chờ xử lý so someone still has to click Duyệt on the repaired row.
 */
export async function applyDipCorrection(params: {
  dip: TankDipRecord
  dipValue?: number
  tankCode?: string
  fuelType?: string
  userId: string
}): Promise<TankDipRecord> {
  const { dip, userId } = params

  const dipValue = params.dipValue ?? Number(dip.dipValue)
  const tankCode = params.tankCode ?? dip.tankCode
  const movedTank = tankCode !== dip.tankCode
  // isReserve is not re-derived for a retyped number: it records whether a trụ
  // drew from the hầm when it was measured, and the number does not change that.
  // A different hầm does — it is a fact about the hầm, and it decides which
  // anomaly rule the row is judged by.
  //
  // Nothing here depends on anything else here, so the hầm it left, the hầm it
  // joined and that hầm's trụ are all asked at once.
  const [from, movedTo, movedReserve] = await Promise.all([
    chainAround(dip, dip.tankCode),
    movedTank ? chainAround(dip, tankCode) : null,
    movedTank ? tankIsReserve(dip.stationId, tankCode) : null,
  ])
  const to = movedTo ?? from
  const isReserve = movedReserve ?? dip.isReserve

  const plan = planDipRewire({ self: { dipValue, isReserve }, from, to, movedTank })

  const data: Prisma.TankDipRecordUpdateInput = { dipValue, isReserve, ...plan.self }
  if (movedTank) data.tankCode = tankCode
  // capacityK is left alone: it is what the plate said, not what the hầm is.
  if (params.fuelType !== undefined) data.fuelType = params.fuelType
  // Keep what the AI read the first time a reviewer actually moves it — stamping
  // on every save would record the AI's own value as its "original" and say
  // nothing. It is also what tells the row to stop showing the AI's confidence
  // beside a number a person typed.
  if (dip.originalDipValue === null && Number(dip.dipValue) !== dipValue) {
    data.originalDipValue = dip.dipValue
  }

  const [updated] = await prisma.$transaction([
    prisma.tankDipRecord.update({ where: { id: dip.id }, data }),
    ...plan.neighbours.map(({ id, ...comparison }) =>
      prisma.tankDipRecord.update({ where: { id }, data: comparison })
    ),
  ])

  await writeAudit({
    userId,
    action: 'tank_dip.correct',
    entity: 'tank_dip_record',
    entityId: dip.id,
    // The displaced values go in the metadata as well as originalDipValue: once
    // that column is stamped, every value between it and the newest one is
    // otherwise unrecoverable — and it only ever holds the số đo, so a displaced
    // hầm or nhiên liệu has nowhere else to be remembered at all.
    metadata: {
      from: {
        ...(params.dipValue !== undefined ? { dipValue: dip.dipValue.toString() } : {}),
        ...(movedTank ? { tankCode: dip.tankCode } : {}),
        ...(params.fuelType !== undefined ? { fuelType: dip.fuelType } : {}),
      },
      to: {
        ...(params.dipValue !== undefined ? { dipValue: updated.dipValue.toString() } : {}),
        ...(movedTank ? { tankCode: updated.tankCode } : {}),
        ...(params.fuelType !== undefined ? { fuelType: updated.fuelType } : {}),
      },
    },
  })
  return updated
}
