import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

import { PrismaClient } from '../lib/generated/prisma/client'

// One-off, idempotent migration for "Duyệt / Từ chối số đo bồn": gives
// `tank_dip_records` the review columns every other AI-read table already has.
//
// The point of the raw SQL is the DEFAULT flip. `prisma db push` would create
// `review_status` with the schema's default of 'pending', which would drop the
// whole đo hầm history in front of kế toán as a backlog and — because a chờ duyệt
// dip still counts — change no figure while doing it. Existing dips have been
// trusted as tồn thực tế all along, so they land 'approved' and Tổng quan keeps
// showing exactly what it shows today. Only dips ingested from now on wait.
//
// Run order: `pnpm db:dip-review` → `pnpm db:push` (reconciles, no-op) →
// `pnpm db:generate`.
//
// Safe to re-run: every ADD COLUMN is `IF NOT EXISTS`, and re-setting a default
// that is already 'pending' is a no-op — so a second run against a migrated table
// changes nothing, and in particular never re-approves a dip someone rejected.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' })
const prisma = new PrismaClient({ adapter })

async function main() {
  // 1. Add the column with the OLD meaning as its default, so every row already
  //    in the table is stamped 'approved' by the ALTER itself — no UPDATE pass,
  //    and nothing to go wrong halfway through on a large table.
  await prisma.$executeRawUnsafe(
    `ALTER TABLE tank_dip_records ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'approved'`
  )

  // 2. Flip the default to the NEW meaning: from here on a đo hầm waits for a
  //    người duyệt whatever the AI's confidence. This is what the Prisma schema
  //    declares, so the `db:push` that follows reconciles to a no-op.
  await prisma.$executeRawUnsafe(
    `ALTER TABLE tank_dip_records ALTER COLUMN review_status SET DEFAULT 'pending'`
  )

  // 3. Who decided, and when — null until someone does.
  await prisma.$executeRawUnsafe(
    `ALTER TABLE tank_dip_records ADD COLUMN IF NOT EXISTS reviewed_by UUID`
  )
  await prisma.$executeRawUnsafe(
    `ALTER TABLE tank_dip_records ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`
  )

  // 4. The review queue reads by status; mirrors idx_readings_review.
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_tank_dips_review ON tank_dip_records (review_status)`
  )

  const counts = await prisma.$queryRaw<{ review_status: string; count: bigint }[]>`
    SELECT review_status, COUNT(*) AS count FROM tank_dip_records GROUP BY review_status
  `
  const summary = counts.map((r) => `${r.review_status}=${Number(r.count)}`).join(', ')
  console.log(`tank_dip_records.review_status ready (${summary || 'no rows'}).`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
