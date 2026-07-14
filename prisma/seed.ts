import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

import { PrismaClient } from '../lib/generated/prisma/client'
import { vungForProvince } from '../lib/misa-export/station-mapping/province-vung'

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

// Latest retail-price effective date from the accountant's GBL sheet. Fixed so
// re-running the seed upserts the same dated rows.
const PRICE_DATE = new Date('2026-06-25')

// Fuel → MISA product/warehouse map for DAKNONG_1 (from the sample sales file).
// productName (Tên hàng) is a starting default — the accountant verifies/replaces it in
// Settings → MISA → Map nhiên liệu against the official Trường Thịnh product list.
type FuelMapSeed = {
  fuelType: string
  productCode: string
  productName: string
  warehouseCode: string
}
const FUEL_MAP: FuelMapSeed[] = [
  { fuelType: 'DO', productCode: 'DO', productName: 'Dầu DO', warehouseCode: 'TT-DN1' },
  { fuelType: 'E0', productCode: 'XA E0', productName: 'Xăng E5 RON 92', warehouseCode: 'TT-DN1' },
  { fuelType: 'DC', productCode: 'DO01', productName: 'Dầu DO 0,001S-V', warehouseCode: 'TT-DN1' },
  { fuelType: 'XANG_A95', productCode: 'A95', productName: 'Xăng RON 95', warehouseCode: 'TT-DN1' },
  {
    fuelType: 'URE',
    productCode: 'URE',
    productName: 'Dung dịch URE (AdBlue)',
    warehouseCode: 'KHONHOTDAKNONG1',
  },
]

// Current retail prices (VND) per fuel. No A95 — not sold at DAKNONG_1.
const RETAIL_PRICES: Record<string, number> = {
  DO: 22290,
  E0: 20300,
  DC: 24430,
  URE: 15000,
}

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
      vung: vungForProvince('Đắk Nông'),
      address: 'Quốc lộ 14, Trường Xuân, Lâm Đồng',
      assignedAccountantId: ACCOUNTANT_ID,
    },
    create: {
      id: STATION_ID,
      code: 'DAKNONG_1',
      name: 'Trạm Đăk Nông 1',
      branch: 'Đắk Nông',
      vung: vungForProvince('Đắk Nông'),
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

  // MISA station config (business unit + account codes).
  await prisma.misaStationConfig.upsert({
    where: { stationId: station.id },
    update: {
      revenueAccount: '5111',
      costAccount: '632',
      stockAccount: '1561',
      creditDebitAccount: '131',
      cashDebitAccount: '11111',
    },
    create: {
      stationId: station.id,
      revenueAccount: '5111',
      costAccount: '632',
      stockAccount: '1561',
      creditDebitAccount: '131',
      cashDebitAccount: '11111',
    },
  })

  // MISA fuel → product/warehouse map.
  for (const f of FUEL_MAP) {
    await prisma.misaFuelMap.upsert({
      where: { stationId_fuelType: { stationId: station.id, fuelType: f.fuelType } },
      update: {
        productCode: f.productCode,
        productName: f.productName,
        warehouseCode: f.warehouseCode,
      },
      create: {
        stationId: station.id,
        fuelType: f.fuelType,
        productCode: f.productCode,
        productName: f.productName,
        warehouseCode: f.warehouseCode,
      },
    })
  }

  // Current retail prices (dated rows).
  for (const [fuelType, unitPrice] of Object.entries(RETAIL_PRICES)) {
    await prisma.misaRetailPrice.upsert({
      where: {
        stationId_fuelType_effectiveDate: {
          stationId: station.id,
          fuelType,
          effectiveDate: PRICE_DATE,
        },
      },
      update: { unitPrice },
      create: { stationId: station.id, fuelType, effectiveDate: PRICE_DATE, unitPrice },
    })
  }

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
