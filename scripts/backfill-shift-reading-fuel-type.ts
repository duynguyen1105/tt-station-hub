import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

import { PrismaClient } from '../lib/generated/prisma/client'

// One-off, idempotent migration for issue 11 (a ca reading stamps its nhiên liệu):
// gives `shift_readings` its own `fuel_type`, copied from the trụ each reader
// joins to today. The copy changes no figure — it is exactly what every reader
// computes now — it only stops that value from moving when a trụ is converted.
//
// The repo drives schema with `prisma db push` (no migration history), and adding
// a NOT NULL column without a default would fail on a non-empty table — so this
// raw-SQL script adds it nullable, backfills, then enforces NOT NULL.
//
// Run order: `pnpm db:fuel-stamp` → `pnpm db:push`
// (reconciles, no-op) → `pnpm db:generate`.
//
// Safe to re-run: adding the column is `IF NOT EXISTS`, the backfill only touches
// rows still NULL, and re-enforcing NOT NULL on an already-NOT NULL column is a
// no-op — so a second run against a migrated table changes nothing.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' })
const prisma = new PrismaClient({ adapter })

async function main() {
  // 1. Add the column nullable so existing readings can be backfilled before NOT NULL.
  await prisma.$executeRawUnsafe(
    `ALTER TABLE shift_readings ADD COLUMN IF NOT EXISTS fuel_type TEXT`
  )

  // 2. Every existing reading inherits its trụ's current nhiên liệu — the value
  //    the MISA export and every screen derive for it today.
  const backfilled = await prisma.$executeRawUnsafe(`
    UPDATE shift_readings r
    SET fuel_type = d.fuel_type
    FROM dispensers d
    WHERE r.dispenser_id = d.id AND r.fuel_type IS NULL
  `)

  // 3. A reading whose trụ no longer exists has nothing to inherit; stop rather
  //    than let ALTER ... SET NOT NULL fail with an opaque constraint error.
  const orphans = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) AS count FROM shift_readings WHERE fuel_type IS NULL
  `
  const orphanCount = Number(orphans[0]?.count ?? 0)
  if (orphanCount > 0) {
    throw new Error(
      `${orphanCount} shift_readings have no dispenser to inherit a fuel_type from; ` +
        `resolve them before enforcing NOT NULL.`
    )
  }

  // 4. Every reading now carries its own nhiên liệu, and must keep doing so.
  await prisma.$executeRawUnsafe(`ALTER TABLE shift_readings ALTER COLUMN fuel_type SET NOT NULL`)

  console.log(`shift_readings.fuel_type stamped from dispensers (${backfilled} rows backfilled).`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
