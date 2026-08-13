import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

import { PrismaClient } from '../lib/generated/prisma/client'
import {
  type RosterStationOutcome,
  compareRosterToStation,
  formatRosterReport,
  rosterDefects,
} from '../lib/imports/roster-check'
import { STATION_ROSTERS } from '../lib/imports/station-rosters'

// Compares the 13 pre-printed biên bản rosters (lib/imports/station-rosters.ts)
// against what the database holds for each Trạm, and reports — repairing
// neither side, in the manner of `pnpm barem:check`.
//
//   pnpm roster:check                # report on the terminal
//   pnpm roster:check > roster.txt   # report to a file
//
// It reads and prints. Nothing here writes: a disagreement between Trường
// Thịnh's paper and the app's configuration is a question for a human, and the
// answer is not always that the paper is right.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' })
const prisma = new PrismaClient({ adapter })

async function main() {
  const stations = await prisma.station.findMany({
    where: { code: { in: STATION_ROSTERS.map((r) => r.stationCode) } },
    select: { id: true, code: true },
  })
  const byCode = new Map(stations.map((s) => [s.code, s]))

  const outcomes: RosterStationOutcome[] = []
  for (const roster of STATION_ROSTERS) {
    const defects = rosterDefects(roster)
    const station = byCode.get(roster.stationCode)
    const unconfigured: RosterStationOutcome = {
      configured: false,
      stationCode: roster.stationCode,
      roster,
      defects,
    }
    if (!station) {
      outcomes.push(unconfigured)
      continue
    }

    const dispensers = await prisma.dispenser.findMany({
      where: { stationId: station.id, isActive: true },
      select: { code: true, fuelType: true, tankCode: true, tankCapacityK: true },
      orderBy: { displayOrder: 'asc' },
    })
    // A Hầm nobody dispenses from is still a Hầm — a reserve tank shows up only
    // in what the station has measured.
    const dipTanks = await prisma.tankDipRecord.findMany({
      where: { stationId: station.id },
      select: { tankCode: true, fuelType: true, capacityK: true },
      distinct: ['tankCode', 'fuelType', 'capacityK'],
    })
    // A Trạm row on its own says nothing about its Hầm and Trụ. Comparing
    // against nothing would report every printed row as missing, which reads as
    // a wall of disagreements where the truth is simply that nobody has set the
    // Trạm up yet.
    if (dispensers.length === 0 && dipTanks.length === 0) {
      outcomes.push(unconfigured)
      continue
    }

    outcomes.push({
      configured: true,
      stationCode: roster.stationCode,
      roster,
      defects,
      mismatches: compareRosterToStation(roster, dispensers, dipTanks),
    })
  }

  console.log(formatRosterReport(outcomes, new Date()))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
