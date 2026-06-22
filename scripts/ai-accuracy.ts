import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { extractMeter } from '@/lib/ai/extract-meter'
import { matchPhotoToDispenser } from '@/lib/matching/photo-to-reading'

import { PrismaClient } from '../lib/generated/prisma/client'

// Runs the real shift-meter extraction over a folder of photos and reports what
// Claude read for each, plus whether it matched a configured dispenser. Needs
// ANTHROPIC_API_KEY + AI_MOCK=false. There is no ground truth, so this surfaces
// reads/misreads/low-confidence/unmatched for a human to confirm.
//
// Usage: pnpm tsx scripts/ai-accuracy.ts [photoDir] [stationCode]

const DIR = process.argv[2] ?? join(process.env.HOME ?? '', 'Downloads', '02-06-2026')
const STATION = process.argv[3] ?? 'DAKNONG_1'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
})

const pad = (v: unknown, n: number) =>
  String(v ?? '—')
    .slice(0, n)
    .padEnd(n)

async function main() {
  const station = await prisma.station.findUnique({
    where: { code: STATION },
    select: { id: true },
  })
  const dispensers = station
    ? await prisma.dispenser.findMany({
        where: { stationId: station.id, isActive: true },
        select: { id: true, code: true },
      })
    : []
  const dref = dispensers.map((d) => ({ id: d.id, code: d.code }))

  const files = readdirSync(DIR)
    .filter((f) => /\.(jpe?g|png)$/i.test(f))
    .sort()
  console.log(`AI accuracy pass — ${files.length} photos from ${DIR}`)
  console.log(
    `Station ${STATION}: ${dispensers.map((d) => d.code).join(', ') || '(no dispensers)'}\n`
  )
  console.log(
    `${pad('file', 26)} | ${pad('meter type', 18)} | ${pad('reading', 12)} | ${pad('disp', 7)} | ${pad('fuel', 4)} | conf | match`
  )
  console.log('-'.repeat(110))

  const byType: Record<string, number> = {}
  let matched = 0
  let lowConf = 0

  for (const f of files) {
    try {
      const r = await extractMeter({ imageBuffer: readFileSync(join(DIR, f)) })
      const m = matchPhotoToDispenser(
        { extractedDispenserCode: r.dispenserLabel, meterType: r.meterType },
        dref
      )
      const matchedCode = m.dispenserId
        ? dispensers.find((d) => d.id === m.dispenserId)?.code
        : null
      byType[r.meterType] = (byType[r.meterType] ?? 0) + 1
      if (m.status === 'matched') matched++
      if (r.readingConfidence != null && r.readingConfidence < 80) lowConf++
      const matchStr = m.status === 'matched' ? `matched→${matchedCode}` : m.status
      console.log(
        `${pad(f, 26)} | ${pad(r.meterType, 18)} | ${pad(r.reading, 12)} | ${pad(r.dispenserLabel, 7)} | ${pad(r.fuelType, 4)} | ${pad(r.readingConfidence, 4)} | ${matchStr}`
      )
    } catch (error) {
      console.log(`${pad(f, 26)} | ERROR: ${(error as Error).message}`)
    }
  }

  console.log('-'.repeat(110))
  console.log(`Matched to a dispenser: ${matched}/${files.length}`)
  console.log(`Low confidence (<80):   ${lowConf}/${files.length}`)
  console.log(`By meter type:          ${JSON.stringify(byType)}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
