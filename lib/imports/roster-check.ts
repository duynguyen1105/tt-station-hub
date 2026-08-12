// Lines the 13 pre-printed forms up against what the app's database holds, and
// says where they disagree. It repairs neither side — the paper is Trường
// Thịnh's document and the `dispensers` table is the app's configuration, and a
// disagreement is a question for a human, not something to smooth over
// (ADR 0003).
//
// Pure: it compares two sets of rows and formats what it found. The database
// reading lives in `scripts/check-rosters.ts`; `pnpm roster:check` runs it.
import { formatDateTime } from '@/lib/format'

import type { RosterTank, StationRoster } from './station-rosters'

/** A defect in the printed form itself, visible without any database. */
export type RosterDefect =
  /** Two different Hầm printed under one number — HTGDONGNAI's two `3.`. */
  | { kind: 'duplicate-tank-number'; tankCode: string; printedLabels: string[] }
  /** The form printed no Hầm numbers; ours came from row order. */
  | { kind: 'inferred-tank-numbers'; count: number }
  /** The form printed no Trụ numbers; ours came from row order. */
  | { kind: 'inferred-pump-numbers'; count: number }
  /** The document is named for one Trạm and prints another's code. */
  | { kind: 'file-name-mismatch'; fileCode: string; stationCode: string }

/** A Trụ as the `dispensers` table holds it, with the Hầm it draws from. */
export type DispenserRow = {
  code: string
  fuelType: string
  tankCode: string | null
  tankCapacityK: number | null
}

/** A Hầm the app has only ever seen measured — no Trụ draws from it. */
export type DipTankRow = {
  tankCode: string
  fuelType: string | null
  capacityK: number | null
}

/** A disagreement between the printed form and the database. */
export type RosterMismatch =
  | { kind: 'tank-fuel'; tankCode: string; paperFuel: string; dbFuels: string[] }
  | {
      kind: 'tank-capacity'
      tankCode: string
      paperCapacityK: number
      dbCapacitiesK: number[]
    }
  | { kind: 'tank-missing-from-db'; tankCode: string }
  | { kind: 'tank-missing-from-paper'; tankCode: string; dbFuels: string[]; dipOnly: boolean }
  | { kind: 'pump-fuel'; pumpCode: string; paperFuel: string; dbFuel: string }
  | { kind: 'pump-missing-from-db'; pumpCode: string; paperFuel: string }
  | { kind: 'pump-missing-from-paper'; pumpCode: string; dbFuel: string }

/** One Trạm's form, as the check left it. */
export type RosterStationOutcome =
  | {
      configured: true
      stationCode: string
      roster: StationRoster
      defects: RosterDefect[]
      mismatches: RosterMismatch[]
    }
  | { configured: false; stationCode: string; roster: StationRoster; defects: RosterDefect[] }

/**
 * The fuels the standard biên bản prints — its goods columns are fixed at
 * `E0 / EA / DO / DC`, and its Trụ table lists only those.
 *
 * DAKNONG1 also sells urê from two dispensers. They are absent from the form by
 * design, not by mistake, so comparing them against it would report the form's
 * own scope as a disagreement.
 */
const BIEN_BAN_FUELS = ['E0', 'EA', 'DO', 'DC']

/** What is wrong with the form on its own terms, before any comparison. */
export function rosterDefects(roster: StationRoster): RosterDefect[] {
  const defects: RosterDefect[] = []

  const byCode = new Map<string, RosterTank[]>()
  for (const tank of roster.tanks) {
    byCode.set(tank.tankCode, [...(byCode.get(tank.tankCode) ?? []), tank])
  }
  for (const [tankCode, tanks] of byCode) {
    if (tanks.length < 2) continue
    defects.push({
      kind: 'duplicate-tank-number',
      tankCode,
      printedLabels: tanks.map((t) => t.printedLabel),
    })
  }

  const inferredTanks = roster.tanks.filter((t) => t.inferred).length
  if (inferredTanks > 0) defects.push({ kind: 'inferred-tank-numbers', count: inferredTanks })
  const inferredPumps = roster.pumps.filter((p) => p.inferred).length
  if (inferredPumps > 0) defects.push({ kind: 'inferred-pump-numbers', count: inferredPumps })

  const fileCode = roster.sourceFile.replace(/^BBGIAONHANXD_/, '').replace(/\.docx$/, '')
  if (fileCode !== roster.stationCode) {
    defects.push({ kind: 'file-name-mismatch', fileCode, stationCode: roster.stationCode })
  }

  return defects
}

/**
 * Compares one Trạm's printed roster against its configuration. A Hầm counts as
 * known to the database if any Trụ draws from it or the app has ever measured
 * it — a reserve tank nobody dispenses from is still a Hầm.
 *
 * Only what the biên bản is about is compared: a urê dispenser is not a Trụ the
 * form ever printed, so it is neither expected on the paper nor missing from it.
 */
export function compareRosterToStation(
  roster: StationRoster,
  allDispensers: DispenserRow[],
  allDipTanks: DipTankRow[]
): RosterMismatch[] {
  const dispensers = allDispensers.filter((d) => BIEN_BAN_FUELS.includes(d.fuelType))
  // A measured Hầm whose fuel nobody recorded is still a Hầm the form should list.
  const dipTanks = allDipTanks.filter(
    (t) => t.fuelType === null || BIEN_BAN_FUELS.includes(t.fuelType)
  )

  const dbTanks = new Map<
    string,
    { fuels: string[]; capacitiesK: number[]; fromDispenser: boolean }
  >()
  function noteTank(
    tankCode: string,
    fuel: string | null,
    capacityK: number | null,
    fromDispenser: boolean
  ): void {
    const entry = dbTanks.get(tankCode) ?? { fuels: [], capacitiesK: [], fromDispenser: false }
    if (fuel !== null && !entry.fuels.includes(fuel)) entry.fuels.push(fuel)
    if (capacityK !== null && !entry.capacitiesK.includes(capacityK)) {
      entry.capacitiesK.push(capacityK)
    }
    entry.fromDispenser ||= fromDispenser
    dbTanks.set(tankCode, entry)
  }
  for (const d of dispensers) {
    if (d.tankCode) noteTank(d.tankCode, d.fuelType, d.tankCapacityK, true)
  }
  for (const t of dipTanks) noteTank(t.tankCode, t.fuelType, t.capacityK, false)

  const mismatches: RosterMismatch[] = []

  // HTGDONGNAI prints two Hầm under `3.`, so the database has one row where the
  // paper has two and only one of them can be checked. Which one is a guess, and
  // guessing is what the duplicate defect exists to stop — so the number is
  // compared once and `describeDefect` says the other row went unchecked.
  const seen = new Set<string>()
  for (const tank of roster.tanks) {
    if (seen.has(tank.tankCode)) continue
    seen.add(tank.tankCode)

    const known = dbTanks.get(tank.tankCode)
    if (!known) {
      mismatches.push({ kind: 'tank-missing-from-db', tankCode: tank.tankCode })
      continue
    }
    if (known.fuels.length > 0 && !known.fuels.includes(tank.fuel)) {
      mismatches.push({
        kind: 'tank-fuel',
        tankCode: tank.tankCode,
        paperFuel: tank.fuel,
        dbFuels: known.fuels,
      })
    }
    if (known.capacitiesK.length > 0 && !known.capacitiesK.includes(tank.capacityK)) {
      mismatches.push({
        kind: 'tank-capacity',
        tankCode: tank.tankCode,
        paperCapacityK: tank.capacityK,
        dbCapacitiesK: known.capacitiesK,
      })
    }
  }
  for (const [tankCode, known] of dbTanks) {
    if (seen.has(tankCode)) continue
    mismatches.push({
      kind: 'tank-missing-from-paper',
      tankCode,
      dbFuels: known.fuels,
      dipOnly: !known.fromDispenser,
    })
  }

  const dbPumps = new Map(dispensers.map((d) => [d.code, d]))
  for (const pump of roster.pumps) {
    const known = dbPumps.get(pump.pumpCode)
    if (!known) {
      mismatches.push({
        kind: 'pump-missing-from-db',
        pumpCode: pump.pumpCode,
        paperFuel: pump.fuel,
      })
      continue
    }
    if (known.fuelType !== pump.fuel) {
      mismatches.push({
        kind: 'pump-fuel',
        pumpCode: pump.pumpCode,
        paperFuel: pump.fuel,
        dbFuel: known.fuelType,
      })
    }
  }
  const onPaper = new Set(roster.pumps.map((p) => p.pumpCode))
  for (const d of dispensers) {
    if (onPaper.has(d.code)) continue
    mismatches.push({ kind: 'pump-missing-from-paper', pumpCode: d.code, dbFuel: d.fuelType })
  }

  return mismatches
}

/** The whole run, as a page a human reads and acts on. Nothing was written. */
export function formatRosterReport(outcomes: RosterStationOutcome[], checkedAt: Date): string {
  const width = Math.max(...outcomes.map((o) => o.stationCode.length)) + 2
  const lines = [
    `ĐỐI CHIẾU DANH SÁCH HẦM/TRỤ TRÊN BIÊN BẢN VỚI CẤU HÌNH — ${formatDateTime(checkedAt)}`,
    'Không ghi gì vào cơ sở dữ liệu — chỉ báo cáo.',
    '',
  ]

  for (const outcome of outcomes) {
    // Counted by distinct number, which is how many were compared: HTGDONGNAI
    // prints four Hầm rows but only three numbers, and claiming four matched
    // would be counting the row the duplicate defect says went unchecked.
    const { tanks, pumps } = outcome.roster
    const hamCount = new Set(tanks.map((t) => t.tankCode)).size
    const truCount = new Set(pumps.map((p) => p.pumpCode)).size
    // A defect on the paper does not stop the two sides agreeing, and whether
    // they agree is the question the command was run to answer — so the ✓ is
    // about the comparison alone, and the ⚠ lines say what else to look at.
    const verdict = outcome.configured
      ? outcome.mismatches.length === 0
        ? [`✓ ${hamCount} hầm, ${truCount} trụ — khớp`]
        : outcome.mismatches.map((mismatch) => `⚠ ${describeMismatch(mismatch)}`)
      : ['— chưa cấu hình trạm trong DB']
    const notes = [...outcome.defects.map((defect) => `⚠ ${describeDefect(defect)}`), ...verdict]
    lines.push(
      ...notes.map((note, i) => `  ${(i === 0 ? outcome.stationCode : '').padEnd(width)}${note}`)
    )
  }

  const configured = outcomes.filter((o) => o.configured)
  const matching = configured.filter((o) => o.mismatches.length === 0)
  lines.push(
    '',
    '─'.repeat(72),
    'TỔNG KẾT',
    `  Trạm khớp với DB: ${matching.length}/${configured.length}`,
    `  Trạm chưa cấu hình trong DB: ${outcomes.length - configured.length}`,
    `  Lỗi trên giấy: ${outcomes.reduce((n, o) => n + o.defects.length, 0)}`,
    `  Sai lệch giấy ↔ DB: ${configured.reduce((n, o) => n + o.mismatches.length, 0)}`
  )
  return lines.join('\n')
}

function describeDefect(defect: RosterDefect): string {
  switch (defect.kind) {
    case 'duplicate-tank-number':
      return (
        `giấy đánh số trùng: ${defect.printedLabels.length} hầm cùng ghi ` +
        `"${defect.tankCode.replace('HAM_', '')}." — ${defect.printedLabels.join(' / ')}; ` +
        `chỉ đối chiếu được một dòng với DB`
      )
    case 'inferred-tank-numbers':
      return `giấy không đánh số hầm (${defect.count} dòng) — đã suy ra theo thứ tự dòng, cần xác nhận`
    case 'inferred-pump-numbers':
      return `giấy không đánh số trụ (${defect.count} dòng) — đã suy ra theo thứ tự dòng, cần xác nhận`
    case 'file-name-mismatch':
      return `tên file là ${defect.fileCode}, mã trên giấy là ${defect.stationCode} — lấy theo giấy`
  }
}

function describeMismatch(mismatch: RosterMismatch): string {
  switch (mismatch.kind) {
    case 'tank-fuel':
      return `${hamLabel(mismatch.tankCode)}: nhiên liệu — giấy ghi ${mismatch.paperFuel}, DB ghi ${mismatch.dbFuels.join(' / ')}`
    case 'tank-capacity':
      return (
        `${hamLabel(mismatch.tankCode)}: dung tích — giấy ghi ${mismatch.paperCapacityK}K, ` +
        `DB ghi ${mismatch.dbCapacitiesK.map((k) => `${k}K`).join(' / ')}`
      )
    case 'tank-missing-from-db':
      return `${hamLabel(mismatch.tankCode)}: có trên giấy nhưng không có trong DB`
    case 'tank-missing-from-paper':
      return (
        `${hamLabel(mismatch.tankCode)}: có trong DB${describeFuels(mismatch.dbFuels)} ` +
        `nhưng không có trên giấy${mismatch.dipOnly ? ' (chỉ thấy qua số đo hầm)' : ''}`
      )
    case 'pump-fuel':
      return `${truLabel(mismatch.pumpCode)}: nhiên liệu — giấy ghi ${mismatch.paperFuel}, DB ghi ${mismatch.dbFuel}`
    case 'pump-missing-from-db':
      return `${truLabel(mismatch.pumpCode)} (${mismatch.paperFuel}): có trên giấy nhưng không có trong DB`
    case 'pump-missing-from-paper':
      return `${truLabel(mismatch.pumpCode)} (${mismatch.dbFuel}): có trong DB nhưng không có trên giấy`
  }
}

function describeFuels(fuels: string[]): string {
  return fuels.length === 0 ? '' : ` (${fuels.join(' / ')})`
}

/** "HAM_3" → "Hầm 3" — the report speaks the station's language, not the schema's. */
function hamLabel(tankCode: string): string {
  return tankCode.replace('HAM_', 'Hầm ')
}

function truLabel(pumpCode: string): string {
  return pumpCode.replace('TRU_', 'Trụ ')
}
