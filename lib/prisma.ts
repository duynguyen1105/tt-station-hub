import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/lib/generated/prisma/client'

// Reuse a single client across hot reloads in development to avoid exhausting
// database connections. Prisma 7 uses the Query Compiler + a driver adapter.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
