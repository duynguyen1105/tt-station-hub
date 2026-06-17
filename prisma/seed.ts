import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

import { PrismaClient } from '../lib/generated/prisma/client'

// Standalone seed script (run via `tsx prisma/seed.ts`). Self-contained so it
// does not depend on the `@/` path alias. Seeds station ĐAKNONG 1 from the
// real sample data described in the build plan.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' })
const prisma = new PrismaClient({ adapter })

// Fixed IDs keep the seed idempotent across re-runs.
const STATION_ID = '11111111-1111-1111-1111-111111111111'
const ADMIN_ID = '22222222-2222-2222-2222-222222222201'
const ACCOUNTANT_ID = '22222222-2222-2222-2222-222222222202'
const CUSTOMER_ID = '33333333-3333-3333-3333-333333333301'

type DispenserSeed = {
  code: string
  displayName: string
  fuelType: string
  tankCode: string
  tankCapacityK: number
  displayOrder: number
}

const DISPENSERS: DispenserSeed[] = [
  {
    code: 'TRU_1',
    displayName: 'Trụ 1',
    fuelType: 'DO',
    tankCode: 'HAM_3',
    tankCapacityK: 25,
    displayOrder: 1,
  },
  {
    code: 'TRU_2',
    displayName: 'Trụ 2',
    fuelType: 'E0',
    tankCode: 'HAM_1',
    tankCapacityK: 15,
    displayOrder: 2,
  },
  {
    code: 'TRU_3',
    displayName: 'Trụ 3',
    fuelType: 'E0',
    tankCode: 'HAM_1',
    tankCapacityK: 15,
    displayOrder: 3,
  },
  {
    code: 'TRU_4',
    displayName: 'Trụ 4',
    fuelType: 'DC',
    tankCode: 'HAM_2',
    tankCapacityK: 10,
    displayOrder: 4,
  },
  {
    code: 'TRU_5',
    displayName: 'Trụ 5',
    fuelType: 'DC',
    tankCode: 'HAM_2',
    tankCapacityK: 10,
    displayOrder: 5,
  },
  {
    code: 'TRU_6',
    displayName: 'Trụ 6',
    fuelType: 'DO',
    tankCode: 'HAM_3',
    tankCapacityK: 25,
    displayOrder: 6,
  },
]

async function main() {
  // Users (profiles). NOTE: in production these IDs must match Supabase Auth
  // user IDs; created here as placeholders for local development.
  await prisma.profile.upsert({
    where: { email: 'admin@truongthinh.local' },
    update: { fullName: 'Quản trị viên', role: 'admin', isActive: true },
    create: {
      id: ADMIN_ID,
      email: 'admin@truongthinh.local',
      fullName: 'Quản trị viên',
      role: 'admin',
    },
  })

  await prisma.profile.upsert({
    where: { email: 'vi@truongthinh.local' },
    update: { fullName: 'Kế toán Vi', role: 'accountant', isActive: true },
    create: {
      id: ACCOUNTANT_ID,
      email: 'vi@truongthinh.local',
      fullName: 'Kế toán Vi',
      role: 'accountant',
    },
  })

  // Station ĐAKNONG 1.
  const station = await prisma.station.upsert({
    where: { code: 'DAKNONG_1' },
    update: {
      name: 'Trạm Đăk Nông 1',
      branch: 'Đắk Nông',
      address: 'Quốc lộ 14, Trường Xuân, Lâm Đồng',
      assignedAccountantId: ACCOUNTANT_ID,
    },
    create: {
      id: STATION_ID,
      code: 'DAKNONG_1',
      name: 'Trạm Đăk Nông 1',
      branch: 'Đắk Nông',
      address: 'Quốc lộ 14, Trường Xuân, Lâm Đồng',
      assignedAccountantId: ACCOUNTANT_ID,
    },
  })

  // Dispensers (trụ bơm).
  for (const d of DISPENSERS) {
    await prisma.dispenser.upsert({
      where: { stationId_code: { stationId: station.id, code: d.code } },
      update: {
        displayName: d.displayName,
        fuelType: d.fuelType,
        tankCode: d.tankCode,
        tankCapacityK: d.tankCapacityK,
        displayOrder: d.displayOrder,
      },
      create: {
        stationId: station.id,
        code: d.code,
        displayName: d.displayName,
        fuelType: d.fuelType,
        tankCode: d.tankCode,
        tankCapacityK: d.tankCapacityK,
        displayOrder: d.displayOrder,
      },
    })
  }

  // Inventory balances, one per distinct fuel type at the station.
  const fuelTypes = [...new Set(DISPENSERS.map((d) => d.fuelType))]
  for (const fuelType of fuelTypes) {
    await prisma.inventoryBalance.upsert({
      where: { stationId_fuelType: { stationId: station.id, fuelType } },
      update: {},
      create: { stationId: station.id, fuelType, estimatedStock: 0 },
    })
  }

  // Debt customer.
  await prisma.debtCustomer.upsert({
    where: { id: CUSTOMER_ID },
    update: { name: 'Tiến Oanh', stationId: station.id },
    create: { id: CUSTOMER_ID, name: 'Tiến Oanh', stationId: station.id },
  })

  console.log('Seed completed: station DAKNONG_1 with %d dispensers.', DISPENSERS.length)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
