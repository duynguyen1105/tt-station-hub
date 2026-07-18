import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

import { PrismaClient } from '../lib/generated/prisma/client'
import { deriveReviewState } from '../lib/matching/review-state'

// Local-demo helper (run after `prisma db seed`): adds one shift with readings
// and a debt visit so the review screens have data to show. Run with:
//   pnpm exec tsx prisma/demo-data.ts

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' })
const prisma = new PrismaClient({ adapter })

const STATION_ID = '11111111-1111-1111-1111-111111111111'
const SHIFT_ID = '44444444-4444-4444-4444-444444444401'
const CUSTOMER_ID = '33333333-3333-3333-3333-333333333301'

function num(value: unknown): number | null {
  return value == null ? null : Number(value)
}

// Each reading's opening comes from the dispenser's seeded last reading (see
// `seed.ts`), so liters are genuinely computed; its warnings and review status
// are derived by the shared rule, not hand-written. Sample i is measured against
// dispenser i. The demo attaches no real ShiftPhoto rows, so photo presence is a
// declared input to the rule (Trụ 6's mechanical is absent, to compute the
// missing-photo warning). Confidence and readings are chosen so the six rows
// cover auto-approve, pending, a decreased reading (which also trips
// low-confidence), and a missing photo — all as the rule actually computes them.
type Sample = {
  electronic: string
  mechanical: string
  ec: number
  mc: number
  hasElectronicPhoto: boolean
  hasMechanicalPhoto: boolean
}

const SAMPLES: Sample[] = [
  {
    electronic: '30256194',
    mechanical: '455679',
    ec: 98,
    mc: 90,
    hasElectronicPhoto: true,
    hasMechanicalPhoto: true,
  },
  {
    electronic: '18886374',
    mechanical: '1042745',
    ec: 99,
    mc: 72,
    hasElectronicPhoto: true,
    hasMechanicalPhoto: true,
  },
  {
    electronic: '9832398',
    mechanical: '235624',
    ec: 96,
    mc: 88,
    hasElectronicPhoto: true,
    hasMechanicalPhoto: true,
  },
  {
    electronic: '5875597',
    mechanical: '0213277',
    ec: 70,
    mc: 60,
    hasElectronicPhoto: true,
    hasMechanicalPhoto: true,
  },
  {
    electronic: '10070152',
    mechanical: '010003',
    ec: 97,
    mc: 85,
    hasElectronicPhoto: true,
    hasMechanicalPhoto: true,
  },
  {
    electronic: '73854860',
    mechanical: '045955',
    ec: 95,
    mc: 55,
    hasElectronicPhoto: true,
    hasMechanicalPhoto: false,
  },
]

async function main() {
  const now = new Date()
  const shiftDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  await prisma.shift.upsert({
    where: { id: SHIFT_ID },
    update: { status: 'pending_review' },
    create: {
      id: SHIFT_ID,
      stationId: STATION_ID,
      shiftDate,
      shiftType: 'morning',
      employeeName: 'Nhân viên A',
      status: 'pending_review',
      totalDispensers: 6,
    },
  })

  const dispensers = await prisma.dispenser.findMany({
    where: { stationId: STATION_ID },
    orderBy: { displayOrder: 'asc' },
  })

  for (const [index, dispenser] of dispensers.entries()) {
    const sample = SAMPLES[index % SAMPLES.length]
    if (!sample) continue

    const review = deriveReviewState({
      electronicReading: Number(sample.electronic),
      mechanicalReading: Number(sample.mechanical),
      openingElectronicReading: num(dispenser.lastElectronicReading),
      openingMechanicalReading: num(dispenser.lastMechanicalReading),
      electronicConfidence: sample.ec,
      mechanicalConfidence: sample.mc,
      hasElectronicMeter: dispenser.hasElectronicMeter,
      hasMechanicalMeter: dispenser.hasMechanicalMeter,
      hasElectronicPhoto: sample.hasElectronicPhoto,
      hasMechanicalPhoto: sample.hasMechanicalPhoto,
    })

    const data = {
      openingElectronicReading: dispenser.lastElectronicReading,
      openingMechanicalReading: dispenser.lastMechanicalReading,
      electronicReading: sample.electronic,
      mechanicalReading: sample.mechanical,
      aiElectronicConfidence: sample.ec,
      aiMechanicalConfidence: sample.mc,
      reviewStatus: review.reviewStatus,
      isAnomaly: review.isAnomaly,
      anomalyReasons: review.anomalyReasons,
    }

    await prisma.shiftReading.upsert({
      where: { shiftId_dispenserId: { shiftId: SHIFT_ID, dispenserId: dispenser.id } },
      update: data,
      create: { shiftId: SHIFT_ID, dispenserId: dispenser.id, ...data },
    })
  }

  await prisma.debtVehicleVisit.upsert({
    where: { id: '55555555-5555-5555-5555-555555555501' },
    update: {},
    create: {
      id: '55555555-5555-5555-5555-555555555501',
      stationId: STATION_ID,
      customerId: CUSTOMER_ID,
      visitDate: now,
      litersRead: 43.0,
      unitPriceRead: 27760,
      displayedAmount: 1193680,
      computedAmount: 1193680,
      amountMatchesDisplay: true,
      plateRead: '51C-12345',
      aiConfidence: 92,
      reviewStatus: 'needs_review',
      anomalyReasons: [],
    },
  })

  console.log('Demo data inserted: 1 shift (6 readings) + 1 debt visit.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
