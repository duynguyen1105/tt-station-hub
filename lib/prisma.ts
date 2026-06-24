import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/lib/generated/prisma/client'

// Reuse a single client across hot reloads in development to avoid exhausting
// database connections. Prisma 7 uses the Query Compiler + a driver adapter.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Connection string for the runtime adapter. On Supabase the Session pooler
 * (port 5432) keeps one backend connection per client for the whole session, so a
 * burst of concurrent serverless invocations — e.g. someone sending 17 Zalo photos
 * at once, each firing its own webhook — quickly hits the 15-connection cap
 * (EMAXCONNSESSION) and takes the whole app down. The Transaction pooler (port 6543)
 * releases the connection after each statement and multiplexes many clients, which is
 * what serverless needs, so we target it at runtime. Migrations (db push / migrate)
 * still use DATABASE_URL/DIRECT_URL on 5432, which they require for advisory locks.
 */
function runtimeConnectionString(): string {
  const url = process.env.DATABASE_URL ?? ''
  return url.replace('.pooler.supabase.com:5432', '.pooler.supabase.com:6543')
}

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: runtimeConnectionString(),
    // Keep each serverless instance lean; the transaction pooler multiplexes the rest.
    max: 5,
    idleTimeoutMillis: 10_000,
  })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
