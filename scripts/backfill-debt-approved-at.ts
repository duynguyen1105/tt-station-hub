import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

import { PrismaClient } from '../lib/generated/prisma/client'

// One-off, idempotent migration for "Bán nợ theo thứ tự duyệt": gives
// `debt_vehicle_visits` an `approved_at` and fills it for every lượt xe already duyệt'd.
//
// `reviewed_at` cannot stand in for it: a Sửa after Duyệt moves it, which would send a
// lượt xe to the bottom of its ca's Bán nợ list. The time a lượt xe was duyệt'd is kept
// instead by its charge in the sổ công nợ — `debt_transactions.created_at`, written by
// Duyệt alone and never rewritten by a Sửa. Only a charge-less approved row (none should
// exist) falls back to `reviewed_at`.
//
// Run order: `pnpm db:approved-at` → `pnpm db:push` (reconciles, no-op) →
// `pnpm db:generate`.
//
// Safe to re-run: ADD COLUMN is `IF NOT EXISTS`, and only rows still without an
// approved_at are filled, so one stamped by Duyệt since is never overwritten.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' })
const prisma = new PrismaClient({ adapter })

async function main() {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE debt_vehicle_visits ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP(3)`
  )

  const filled = await prisma.$executeRawUnsafe(`
    UPDATE debt_vehicle_visits v
       SET approved_at = COALESCE(
             (SELECT MIN(t.created_at) FROM debt_transactions t
               WHERE t.source_ref = v.id::text AND t.tx_type = 'charge'),
             v.reviewed_at)
     WHERE v.review_status = 'approved' AND v.approved_at IS NULL
  `)

  console.log(`debt_vehicle_visits.approved_at ready (${filled} approved lượt xe filled).`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
