import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

import { PrismaClient } from '../lib/generated/prisma/client'

// Registers an authorized Zalo sender (station staff) into the allowlist so their
// 1-1 Zalo photos are processed and routed to their station. Self-contained
// (no `@/` alias), mirroring prisma/seed.ts.
//
// Usage:
//   pnpm tsx scripts/register-zalo-sender.ts <zaloUserId> <stationCode> ["Display Name"]
// Example:
//   pnpm tsx scripts/register-zalo-sender.ts 5476962738664437863 DAKNONG_1 "Anh Tiến"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' })
const prisma = new PrismaClient({ adapter })

async function main() {
  const [, , zaloUserId, stationCode, ...nameParts] = process.argv
  if (!zaloUserId || !stationCode) {
    console.error(
      'Usage: pnpm tsx scripts/register-zalo-sender.ts <zaloUserId> <stationCode> ["Display Name"]'
    )
    process.exit(1)
  }
  const displayName = nameParts.join(' ') || null

  const station = await prisma.station.findUnique({
    where: { code: stationCode },
    select: { id: true, name: true },
  })
  if (!station) {
    console.error(`Station with code "${stationCode}" not found.`)
    process.exit(1)
  }

  const sender = await prisma.zaloSender.upsert({
    where: { zaloUserId },
    create: { zaloUserId, stationId: station.id, displayName, isActive: true },
    update: { stationId: station.id, displayName, isActive: true },
  })

  console.log(
    `✓ Registered Zalo sender ${zaloUserId} -> ${stationCode} (${station.name})` +
      `${displayName ? ` as "${displayName}"` : ''}. id=${sender.id}`
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
