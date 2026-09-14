import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

import { tankFieldsFor } from '@/lib/dispensers/rules'
import { planTankBackfill } from '@/lib/dispensers/tank-backfill'

import { PrismaClient } from '../lib/generated/prisma/client'

// One-off, idempotent migration for ADR 0006 (the hầm is the root): fills `tanks`
// from the hầm code, nhiên liệu and dung tích every trụ carries today, and attaches
// each trụ to its row. Changes no figure — every trụ is rewritten with the same values
// it already holds, except a dung tích its hầm-mates knew and it did not.
//
// `tanks` and `dispensers.tank_id` are purely additive (a new table, a nullable
// column), so `prisma db push` creates them without touching a row.
//
// Run order: `pnpm db:push` → `pnpm db:generate` → `pnpm db:tanks`.
//
// A hầm whose trụ disagree on nhiên liệu or dung tích is reported and skipped, never
// guessed (ADR 0003); its trụ stay under Không có hầm on the config page, where a kế
// toán creates the hầm and moves them. The script exits non-zero while any remain.
//
// Safe to re-run: it reads only trụ with a hầm code and no tank_id, and attaches them to
// the Hầm row an earlier run (or the config page) already made.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' })
const prisma = new PrismaClient({ adapter })

async function main() {
  const [dispensers, tanks, stations] = await Promise.all([
    prisma.dispenser.findMany({
      where: { tankId: null, tankCode: { not: null } },
      select: {
        id: true,
        stationId: true,
        displayName: true,
        tankCode: true,
        fuelType: true,
        tankCapacityK: true,
      },
    }),
    prisma.tank.findMany(),
    prisma.station.findMany({ select: { id: true, code: true } }),
  ])
  const stationCode = new Map(stations.map((s) => [s.id, s.code]))

  const plan = planTankBackfill(
    dispensers.flatMap((d) => (d.tankCode === null ? [] : [{ ...d, tankCode: d.tankCode }])),
    tanks
  )

  for (const create of plan.creates) {
    await prisma.$transaction(async (tx) => {
      const tank = await tx.tank.create({
        data: {
          stationId: create.stationId,
          code: create.code,
          fuelType: create.fuelType,
          capacityK: create.capacityK,
        },
      })
      await tx.dispenser.updateMany({
        where: { id: { in: create.dispenserIds } },
        data: tankFieldsFor(tank),
      })
    })
  }

  for (const attach of plan.attaches) {
    await prisma.$transaction(async (tx) => {
      const tank = await tx.tank.update({
        where: { id: attach.tankId },
        data: { capacityK: attach.capacityK },
      })
      // Every trụ on the hầm, not only the newly attached: a dung tích the row just
      // learned has to reach the trụ already there too.
      await tx.dispenser.updateMany({
        where: { OR: [{ id: { in: attach.dispenserIds } }, { tankId: tank.id }] },
        data: tankFieldsFor(tank),
      })
    })
  }

  const attached =
    plan.creates.reduce((n, c) => n + c.dispenserIds.length, 0) +
    plan.attaches.reduce((n, a) => n + a.dispenserIds.length, 0)
  console.log(
    `tanks: ${plan.creates.length} created, ${attached} dispensers attached ` +
      `(${plan.attaches.length} to existing tanks).`
  )

  if (plan.conflicts.length > 0) {
    console.error(`\n${plan.conflicts.length} tanks skipped — their dispensers disagree:`)
    for (const c of plan.conflicts) {
      console.error(`  ${stationCode.get(c.stationId) ?? c.stationId} ${c.code}: ${c.detail}`)
    }
    process.exitCode = 1
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
