import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

import { PrismaClient } from '../lib/generated/prisma/client'

// One-off, idempotent migration for issue 03 (per-Vùng retail prices):
// re-keys `misa_retail_prices` from `station_id` to `vung` in place, preserving
// existing rows. The repo drives schema with `prisma db push` (no migration
// history), and adding a required `vung` column without a default would fail on a
// non-empty table — so this raw-SQL script does the column swap before `db push`.
//
// Run order (see plan): `tsx scripts/backfill-misa-retail-prices-vung.ts`
// → `pnpm db:push` (reconciles, no-op) → `pnpm db:generate`.
//
// Safe to re-run: every step is gated on `station_id` still existing, so a second
// run against an already-migrated table is a no-op.

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

async function main() {
  if (!(await columnExists('misa_retail_prices', 'station_id'))) {
    console.log('misa_retail_prices already keyed by vung — nothing to do.')
    return
  }

  // 1. Add the nullable vung column so existing rows can be backfilled before NOT NULL.
  await prisma.$executeRawUnsafe(
    `ALTER TABLE misa_retail_prices ADD COLUMN IF NOT EXISTS vung "Vung"`
  )

  // 2. Inherit each price's zone from its station.
  await prisma.$executeRawUnsafe(`
    UPDATE misa_retail_prices p
    SET vung = s.vung
    FROM stations s
    WHERE p.station_id = s.id AND p.vung IS NULL
  `)

  // 3. Newest-wins on [vung, fuel_type, effective_date] collisions: keep the most
  //    recently created row (tie-break by id), delete the rest.
  await prisma.$executeRawUnsafe(`
    DELETE FROM misa_retail_prices a
    USING misa_retail_prices b
    WHERE a.id <> b.id
      AND a.vung = b.vung
      AND a.fuel_type = b.fuel_type
      AND a.effective_date = b.effective_date
      AND (a.created_at < b.created_at OR (a.created_at = b.created_at AND a.id < b.id))
  `)

  // 4. Enforce the zone is always present.
  await prisma.$executeRawUnsafe(`ALTER TABLE misa_retail_prices ALTER COLUMN vung SET NOT NULL`)

  // 5. Drop the old station-scoped unique and the station_id column.
  await prisma.$executeRawUnsafe(
    `ALTER TABLE misa_retail_prices DROP CONSTRAINT IF EXISTS misa_retail_prices_station_id_fuel_type_effective_date_key`
  )
  await prisma.$executeRawUnsafe(
    `DROP INDEX IF EXISTS misa_retail_prices_station_id_fuel_type_effective_date_key`
  )
  await prisma.$executeRawUnsafe(`ALTER TABLE misa_retail_prices DROP COLUMN IF EXISTS station_id`)

  // 6. Add the Vùng-scoped unique (name matches Prisma's, so `db push` sees no diff).
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS misa_retail_prices_vung_fuel_type_effective_date_key
     ON misa_retail_prices (vung, fuel_type, effective_date)`
  )

  console.log('misa_retail_prices re-keyed from station_id to vung.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
