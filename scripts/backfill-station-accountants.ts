import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

import { PrismaClient } from '../lib/generated/prisma/client'

// One-off, idempotent migration for issue 01 (a trạm has many kế toán phụ
// trách): moves phụ trách off the `stations.assigned_accountant_id` column and
// into the `station_accountants` join table. The repo drives schema with
// `prisma db push` (no migration history), so a plain push would drop the column
// and the assignments in it together — this script expands, backfills and only
// then contracts, and it checks the copy arrived before dropping anything.
//
// Run order: `pnpm db:phu-trach` → `pnpm db:push` (reconciles, no-op)
// → `pnpm db:generate`. See docs/local-development.md, "One-off migrations".
//
// Safe to re-run: every step is gated on the old column still existing, so a
// second run against an already-migrated database is a no-op.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' })
const prisma = new PrismaClient({ adapter })

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = ${table} AND column_name = ${column}
    ) AS "exists"
  `
  return rows[0]?.exists ?? false
}

/** The single number a `SELECT count(*) AS n ...` answers with. */
async function countRows(sql: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(sql)
  return Number(rows[0]?.n ?? 0)
}

async function main() {
  // 1. Expand: the join table, whether or not the old column is still there, so
  //    a database created after the schema change is left alone below.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS station_accountants (
      station_id uuid NOT NULL,
      accountant_id uuid NOT NULL,
      created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT station_accountants_pkey PRIMARY KEY (station_id, accountant_id)
    )
  `)
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_station_accountants_accountant
     ON station_accountants (accountant_id)`
  )

  if (!(await columnExists('stations', 'assigned_accountant_id'))) {
    console.log('stations.assigned_accountant_id already gone — nothing to backfill.')
    return
  }

  // 2. Backfill: one join row per trạm that names a phụ trách.
  await prisma.$executeRawUnsafe(`
    INSERT INTO station_accountants (station_id, accountant_id)
    SELECT id, assigned_accountant_id FROM stations
    WHERE assigned_accountant_id IS NOT NULL
    ON CONFLICT DO NOTHING
  `)

  // 3. Confirm the copy arrived before the column goes — the whole point of
  //    doing this in three steps rather than one.
  const missing = await countRows(`
    SELECT count(*) AS n FROM stations s
    WHERE s.assigned_accountant_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM station_accountants sa
        WHERE sa.station_id = s.id AND sa.accountant_id = s.assigned_accountant_id
      )
  `)
  if (missing > 0) {
    throw new Error(`${missing} assignment(s) did not copy — leaving the column in place.`)
  }
  const copied = await countRows(
    `SELECT count(*) AS n FROM stations WHERE assigned_accountant_id IS NOT NULL`
  )

  // 4. Contract.
  await prisma.$executeRawUnsafe(
    `ALTER TABLE stations DROP COLUMN IF EXISTS assigned_accountant_id`
  )

  console.log(`Phụ trách moved into station_accountants (${copied} assignment(s) preserved).`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
