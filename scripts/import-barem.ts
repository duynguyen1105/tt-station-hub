import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

import { PrismaClient } from '../lib/generated/prisma/client'
import { type BaremSheet, parseBaremSheet } from '../lib/inventory/barem'
import {
  type BaremStationOutcome,
  compareBaremToDispensers,
  formatBaremReport,
} from '../lib/inventory/barem-report'
import {
  BAREM_SHEETS,
  type BaremSheetBinding,
  baremSheetCsvUrl,
} from '../lib/inventory/barem-sheets'

// Imports Trường Thịnh's Barem spreadsheet into the app's own database, and
// prints the defect report that goes back to them (ADR 0003).
//
// Run by hand — never on a schedule. Anyone with edit access to the shared
// Google file would otherwise be able to change what every delivery is worth
// with no human in the loop.
//
//   pnpm barem:import              # report on the terminal
//   pnpm barem:import > barem.txt  # report to a file; progress stays on stderr
//
// Each Trạm is replaced wholesale inside its own transaction, so a sheet that
// cannot be fetched or parsed is reported and skipped while the rest still
// import — and the skipped Trạm keeps the Barem it already had. Saved receipts
// are untouched either way: their litres were written at confirm time.

// The session pooler (5432), not the transaction pooler lib/prisma.ts targets:
// each Trạm writes ~12,000 points inside one interactive transaction, which
// needs a connection held for its duration.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' })
const prisma = new PrismaClient({ adapter })

/** Rows per insert: ~12,000 points per Trạm, four columns each. */
const CHUNK_SIZE = 5_000

/** How a Trạm is named in the report. The three travel together because every
 *  outcome — imported or skipped — is reported under all of them. */
type StationNames = { stationCode: string; stationName: string; tab: string }

/** A mapped Trạm, resolved against the database. */
type MappedStation = StationNames & { id: string }

async function readSheet(binding: BaremSheetBinding): Promise<BaremSheet> {
  const response = await fetch(baremSheetCsvUrl(binding.gid))
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
  // An unshared or deleted tab answers 200 with Google's sign-in page.
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('csv')) {
    throw new Error(`trang tính không trả về CSV (content-type: ${contentType})`)
  }

  const sheet = parseBaremSheet(await response.text())
  if (sheet.tanks.length === 0) throw new Error('không đọc được Hầm nào trong trang tính')
  // Every point in all 12 sheets is a whole litre, and barem_points stores an
  // integer. Rounding a fractional value in would make the app a second,
  // different Barem (ADR 0003), so this sheet stops instead and keeps the Barem
  // it already had — naming the Hầm and height, which is what the report is for.
  for (const tank of sheet.tanks) {
    for (const [heightMm, liters] of tank.points) {
      if (!Number.isInteger(liters)) {
        throw new Error(
          `${tank.tankCode} ở ${heightMm} mm ghi ${liters} L — không phải số lít nguyên`
        )
      }
    }
  }
  return sheet
}

/** Replaces one Trạm's Barem. Nothing is written unless the whole sheet writes. */
async function storeSheet(
  station: MappedStation,
  sheet: BaremSheet,
  importedAt: Date
): Promise<void> {
  const points = sheet.tanks.flatMap((tank) =>
    [...tank.points.entries()]
      .sort(([a], [b]) => a - b)
      .map(([heightMm, liters]) => ({
        stationId: station.id,
        tankCode: tank.tankCode,
        heightMm,
        liters,
      }))
  )

  await prisma.$transaction(
    async (tx) => {
      await tx.baremPoint.deleteMany({ where: { stationId: station.id } })
      await tx.baremTank.deleteMany({ where: { stationId: station.id } })
      await tx.baremTank.createMany({
        data: sheet.tanks.map((tank) => ({
          stationId: station.id,
          tankCode: tank.tankCode,
          fuelType: tank.fuel,
          nominalCapacityLiters: tank.nominalCapacityLiters,
          minHeightMm: tank.minHeightMm,
          maxHeightMm: tank.maxHeightMm,
          sourceSheet: station.tab,
          importedAt,
        })),
      })
      for (let i = 0; i < points.length; i += CHUNK_SIZE) {
        await tx.baremPoint.createMany({ data: points.slice(i, i + CHUNK_SIZE) })
      }
    },
    { timeout: 120_000, maxWait: 30_000 }
  )
}

async function importSheet(
  binding: BaremSheetBinding,
  stations: Map<string, { id: string; name: string }>,
  importedAt: Date
): Promise<BaremStationOutcome> {
  const row = stations.get(binding.stationCode)
  if (!row) {
    // The map is checked in, so a Trạm it names that the database does not have
    // is a misconfiguration worth seeing — not the silent no-Barem an unmapped
    // Trạm gets.
    const unknown = { stationCode: binding.stationCode, stationName: binding.stationCode }
    return { ok: false, ...unknown, tab: binding.tab, error: 'Trạm không có trong hệ thống' }
  }
  const named: StationNames = {
    stationCode: binding.stationCode,
    stationName: row.name,
    tab: binding.tab,
  }
  const station: MappedStation = { id: row.id, ...named }

  try {
    const sheet = await readSheet(binding)
    // Everything that can fail happens before the write, and the write is the
    // last thing this function does — so a reported failure always means what it
    // says: this Trạm still has the Barem it had before the run.
    const dispensers = await prisma.dispenser.findMany({
      where: { stationId: station.id },
      select: { tankCode: true, fuelType: true, tankCapacityK: true },
    })
    const mismatches = compareBaremToDispensers(
      sheet.tanks.map((tank) => ({
        tankCode: tank.tankCode,
        fuel: tank.fuel,
        nominalCapacityLiters: tank.nominalCapacityLiters,
      })),
      dispensers
    )
    await storeSheet(station, sheet, importedAt)
    return { ok: true, ...named, sheet, mismatches }
  } catch (error) {
    return {
      ok: false,
      ...named,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function main() {
  const importedAt = new Date()
  const rows = await prisma.station.findMany({
    where: { code: { in: BAREM_SHEETS.map((s) => s.stationCode) } },
    select: { id: true, code: true, name: true },
  })
  const stations = new Map(rows.map((s) => [s.code, { id: s.id, name: s.name }]))

  const outcomes: BaremStationOutcome[] = []
  for (const binding of BAREM_SHEETS) {
    process.stderr.write(`… ${binding.tab}`)
    const outcome = await importSheet(binding, stations, importedAt)
    process.stderr.write(
      outcome.ok
        ? `\r✓ ${binding.tab} — ${outcome.sheet.tanks.length} Hầm\n`
        : `\r✗ ${binding.tab} — ${outcome.error}\n`
    )
    outcomes.push(outcome)
  }

  console.log(formatBaremReport(outcomes, importedAt))
  // A skipped sheet leaves that Trạm on its previous Barem, which is easy to miss
  // in a long report — so the exit status says so too.
  if (outcomes.some((outcome) => !outcome.ok)) process.exitCode = 1
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
