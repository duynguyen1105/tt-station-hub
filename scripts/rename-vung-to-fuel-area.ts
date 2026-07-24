import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

import { PrismaClient } from '../lib/generated/prisma/client'

// One-off, idempotent migration: renames the retail-price-zone concept from
// `vung` ("Vùng") to `fuel_area` in the database, so it matches the renamed
// Prisma schema. The repo drives schema with `prisma db push` (no migration
// history), but `db push` would drop-and-recreate on an enum/column rename and
// lose data — so this raw-SQL script renames in place, preserving every row.
//
// Run order: `tsx scripts/rename-vung-to-fuel-area.ts`
// → `pnpm db:push` (reconciles, no-op) → `pnpm db:generate`.
//
// Safe to re-run: every step is gated on the old name still existing, so a
// second run against an already-migrated database is a no-op.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' })
const prisma = new PrismaClient({ adapter })

async function typeExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = ${name}) AS "exists"
  `
  return rows[0]?.exists ?? false
}

async function enumValueExists(typeName: string, value: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = ${typeName} AND e.enumlabel = ${value}
    ) AS "exists"
  `
  return rows[0]?.exists ?? false
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = ${table} AND column_name = ${column}
    ) AS "exists"
  `
  return rows[0]?.exists ?? false
}

async function indexExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = ${name}) AS "exists"
  `
  return rows[0]?.exists ?? false
}

async function main() {
  // 1. Rename the enum type Vung → FuelArea.
  if (await typeExists('Vung')) {
    await prisma.$executeRawUnsafe(`ALTER TYPE "Vung" RENAME TO "FuelArea"`)
  }

  // 2. Rename the enum values VUNG_1/VUNG_2 → FUEL_AREA_1/FUEL_AREA_2.
  if (await enumValueExists('FuelArea', 'VUNG_1')) {
    await prisma.$executeRawUnsafe(`ALTER TYPE "FuelArea" RENAME VALUE 'VUNG_1' TO 'FUEL_AREA_1'`)
  }
  if (await enumValueExists('FuelArea', 'VUNG_2')) {
    await prisma.$executeRawUnsafe(`ALTER TYPE "FuelArea" RENAME VALUE 'VUNG_2' TO 'FUEL_AREA_2'`)
  }

  // 3. Rename the vung columns → fuel_area.
  if (await columnExists('stations', 'vung')) {
    await prisma.$executeRawUnsafe(`ALTER TABLE stations RENAME COLUMN vung TO fuel_area`)
  }
  if (await columnExists('misa_retail_prices', 'vung')) {
    await prisma.$executeRawUnsafe(`ALTER TABLE misa_retail_prices RENAME COLUMN vung TO fuel_area`)
  }

  // 4. Rename the composite unique index to match Prisma's generated name.
  if (await indexExists('misa_retail_prices_vung_fuel_type_effective_date_key')) {
    await prisma.$executeRawUnsafe(
      `ALTER INDEX misa_retail_prices_vung_fuel_type_effective_date_key
       RENAME TO misa_retail_prices_fuel_area_fuel_type_effective_date_key`
    )
  }

  console.log('Renamed vung → fuel_area (enum type, values, columns, index).')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
