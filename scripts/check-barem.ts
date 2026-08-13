import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

import { PrismaClient } from '../lib/generated/prisma/client'
import { fetchBaremSheet } from '../lib/inventory/barem-fetch'
import {
  type BaremStationOutcome,
  compareBaremToDispensers,
  formatBaremReport,
} from '../lib/inventory/barem-report'
import { BAREM_SHEETS, type BaremSheetBinding } from '../lib/inventory/barem-sheets'

// Reads all 12 sheets of Trường Thịnh's Barem spreadsheet and prints the defect
// report that goes back to them (ADR 0003). It writes no Barem anywhere: the
// spreadsheet is the only Barem there is, read live on every lookup (ADR 0005).
//
// This is the only thing that ever inspects a Barem whole. A lookup sees the
// handful of heights it was asked about, so a cliff, an interior gap, or a Barem
// bound to the wrong tank can be noticed nowhere else — which also makes this
// command the admin's answer to "did my edit break the sheet?".
//
//   pnpm barem:check              # report on the terminal
//   pnpm barem:check > barem.txt  # report to a file; progress stays on stderr
//
// A sheet that cannot be fetched or parsed is reported and skipped while the
// other 11 still report. Nothing about the app changes either way — the skipped
// Trạm's Barem is still its trang tính, and still whatever it says right now.

// The `dispensers` table is the one thing here that comes from the database, and
// it is only read: the comparison corrects neither side.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' })
const prisma = new PrismaClient({ adapter })

async function checkSheet(
  binding: BaremSheetBinding,
  stations: Map<string, { id: string; name: string }>
): Promise<BaremStationOutcome> {
  const station = stations.get(binding.stationCode)
  if (!station) {
    // The map is checked in, so a Trạm it names that the database does not have
    // is a misconfiguration worth seeing — not the silent no-Barem an unmapped
    // Trạm gets.
    const unknown = { stationCode: binding.stationCode, stationName: binding.stationCode }
    return { ok: false, ...unknown, tab: binding.tab, error: 'Trạm không có trong hệ thống' }
  }
  const named = {
    stationCode: binding.stationCode,
    stationName: station.name,
    tab: binding.tab,
  }

  // The same read the lookup does, so "the sheet could not be read" means one
  // thing across the app.
  const read = await fetchBaremSheet(binding)
  if (!read.ok) return { ok: false, ...named, error: read.error }

  const dispensers = await prisma.dispenser.findMany({
    where: { stationId: station.id },
    select: { tankCode: true, fuelType: true, tankCapacityK: true },
  })
  const mismatches = compareBaremToDispensers(
    read.sheet.tanks.map((tank) => ({
      tankCode: tank.tankCode,
      fuel: tank.fuel,
      nominalCapacityLiters: tank.nominalCapacityLiters,
    })),
    dispensers
  )
  return { ok: true, ...named, sheet: read.sheet, mismatches }
}

async function main() {
  const checkedAt = new Date()
  const rows = await prisma.station.findMany({
    where: { code: { in: BAREM_SHEETS.map((s) => s.stationCode) } },
    select: { id: true, code: true, name: true },
  })
  const stations = new Map(rows.map((s) => [s.code, { id: s.id, name: s.name }]))

  const outcomes: BaremStationOutcome[] = []
  for (const binding of BAREM_SHEETS) {
    process.stderr.write(`… ${binding.tab}`)
    const outcome = await checkSheet(binding, stations)
    process.stderr.write(
      outcome.ok
        ? `\r✓ ${binding.tab} — ${outcome.sheet.tanks.length} Hầm\n`
        : `\r✗ ${binding.tab} — ${outcome.error}\n`
    )
    outcomes.push(outcome)
  }

  console.log(formatBaremReport(outcomes, checkedAt))
  // A skipped sheet means a Trạm went unchecked, which is easy to miss in a long
  // report — so the exit status says so too.
  if (outcomes.some((outcome) => !outcome.ok)) process.exitCode = 1
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
