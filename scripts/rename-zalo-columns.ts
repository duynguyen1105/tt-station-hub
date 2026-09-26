import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

import { PrismaClient } from '../lib/generated/prisma/client'

// One-off, idempotent migration for the Zalo OA removal: the photo columns that
// outlive Zalo lose their `zalo_` prefix, renamed in place so every older photo
// keeps its sender and time. `db push` would drop-and-recreate a renamed column
// and lose that history.
//
// Run order: `tsx scripts/rename-zalo-columns.ts`
// → `pnpm exec prisma db push --accept-data-loss` → `pnpm db:generate`.
// That push drops everything else that only Zalo used (the zalo_* tables,
// stations.zalo_group_id/zalo_debt_group_id, the Zalo ids on shift_photos,
// debt_vehicle_visits.submitted_by) and adds shift_photos.sender_note.
//
// Safe to re-run: each rename is gated on the old column still existing.

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

const RENAMES = [
  ['shift_photos', 'zalo_sender_name', 'sender_name'],
  ['shift_photos', 'zalo_received_at', 'received_at'],
  ['debt_vehicle_visits', 'zalo_caption', 'sender_note'],
] as const

async function main() {
  for (const [table, from, to] of RENAMES) {
    if (await columnExists(table, from)) {
      await prisma.$executeRawUnsafe(`ALTER TABLE ${table} RENAME COLUMN ${from} TO ${to}`)
      console.log(`Renamed ${table}.${from} → ${to}`)
    }
  }
  console.log('Zalo column renames done.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
