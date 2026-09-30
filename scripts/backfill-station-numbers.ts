import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

import { PrismaClient } from '../lib/generated/prisma/client'

// One-off, idempotent migration for readable page addresses: gives
// `debt_customers` and `fuel_import_receipts` a per-trạm số, so a khách hàng opens
// at `/stations/daknong1/debts/7` and a biên bản at `/stations/daknong1/imports/12`
// rather than at a uuid.
//
// `prisma db push` alone can't do it: a biên bản's `no` is required, and push has
// nothing to fill the rows already there with. So the rows are numbered here, in
// the order they were made, and push then finds the table already as declared.
//
// Run order: `pnpm db:station-no` → `pnpm db:push` (reconciles, no-op) →
// `pnpm db:generate`.
//
// Safe to re-run: only rows still without a số are numbered, carrying on from the
// trạm's highest, so a số once given — and every link carrying it — never moves.
// A khách hàng of no trạm (company-wide) gets none: it never opens under a trạm.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' })
const prisma = new PrismaClient({ adapter })

async function number(table: string) {
  await prisma.$executeRawUnsafe(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS no INT`)
  const numbered = await prisma.$executeRawUnsafe(`
    WITH next AS (
      SELECT t.id,
             COALESCE(m.max_no, 0) + ROW_NUMBER() OVER (PARTITION BY t.station_id ORDER BY t.created_at, t.id) AS no
      FROM ${table} t
      LEFT JOIN (SELECT station_id, MAX(no) AS max_no FROM ${table} GROUP BY station_id) m
        ON m.station_id = t.station_id
      WHERE t.no IS NULL AND t.station_id IS NOT NULL
    )
    UPDATE ${table} SET no = next.no FROM next WHERE ${table}.id = next.id
  `)
  console.log(`${table}: numbered ${numbered} rows`)
}

async function main() {
  await number('debt_customers')
  await number('fuel_import_receipts')

  // Every biên bản belongs to a trạm, so every one now has its số.
  await prisma.$executeRawUnsafe(`ALTER TABLE fuel_import_receipts ALTER COLUMN no SET NOT NULL`)

  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_debt_customers_station_no ON debt_customers (station_id, no)`
  )
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_import_receipts_station_no ON fuel_import_receipts (station_id, no)`
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
