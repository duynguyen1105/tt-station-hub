// The Barem: Trường Thịnh's calibration table for a Hầm, one row per millimetre
// of fuel height. This module holds every decision the feature makes — how a
// sheet is read, what a height resolves to, and what an intake is. It reads no
// database, makes no network call, and has no side effects.
//
// The sheet is imported verbatim (ADR 0003): the spreadsheet's arithmetic errors
// are reported as defects and never repaired, so the app's litres and the
// station's printed Barem always agree.
import { parseVnNumber, tankCodeFromLabel } from '@/lib/imports/bien-ban'

/** A defect found in the source sheet. Reported to Trường Thịnh, never repaired. */
export type BaremDefect =
  | {
      kind: 'litres-fell'
      heightMm: number
      liters: number
      previousHeightMm: number
      previousLiters: number
    }
  /** Heights the column lists with no litres beside them. */
  | { kind: 'missing-points'; fromHeightMm: number; toHeightMm: number; count: number }
  /** Heights the source left out of the sequence altogether. */
  | { kind: 'skipped-heights'; afterHeightMm: number; nextHeightMm: number }
  | { kind: 'duplicate-height'; heightMm: number; liters: number; keptLiters: number }

/** The part of a Hầm's Barem a lookup needs — the same shape whether it comes
 *  from a parsed sheet or from the database. */
export type BaremColumn = {
  minHeightMm: number
  maxHeightMm: number
  points: Map<number, number>
}

export type BaremTank = BaremColumn & {
  tankCode: string
  fuel: string
  /** What the sheet labels the tank. Provenance only — full height legitimately
   *  exceeds it (DO 25,000 → 25,507 L), so it never validates a lookup. */
  nominalCapacityLiters: number | null
  defects: BaremDefect[]
}

export type BaremSheet = {
  stationHeader: string
  tanks: BaremTank[]
}

/** Why a height has no litres. The form's wording is driven by the reason. */
export type BaremRefusal = 'below-minimum' | 'above-maximum' | 'missing-point' | 'unknown-tank'

export type BaremLookup = { ok: true; liters: number } | { ok: false; reason: BaremRefusal }

export type BaremIntake =
  | { fill: true; liters: number }
  | { fill: false; reason: 'no-change' }
  | { fill: false; reason: 'tank-fell'; deltaLiters: number }
  | { fill: false; reason: BaremRefusal; side: 'before' | 'after' }

const HEADER_ROWS = 4

/**
 * Parses one Trạm's sheet: row 1 the station header, row 2 the Hầm labels
 * spanning two columns each, row 3 the fuel and nominal capacity, row 4 the unit
 * headers, then one row per millimetre.
 */
export function parseBaremSheet(csv: string): BaremSheet {
  const rows = parseCsvRows(csv)
  const labels = rows[1] ?? []
  const meta = rows[2] ?? []
  const dataRows = rows.slice(HEADER_ROWS)

  const tanks: BaremTank[] = []
  for (let column = 0; column + 1 < labels.length; column += 2) {
    const tankLabel = tankCodeFromLabel(labels[column] ?? '')
    if (!tankLabel) continue
    // Fuel and capacity come from row 3; the Hầm label carries only the number
    // on these sheets, so tankCodeFromLabel's capacityK is not a second source.
    const tank = readColumn(
      dataRows,
      column,
      tankLabel.code,
      (meta[column] ?? '').trim(),
      (meta[column + 1] ?? '').trim()
    )
    // A labelled column with no readable point has no Barem; a lookup against it
    // refuses as an unknown Hầm rather than reporting an invented range.
    if (tank) tanks.push(tank)
  }

  return { stationHeader: (rows[0]?.[0] ?? '').trim(), tanks }
}

/** Reads one Hầm's height/litre column pair and the defects it carries. */
function readColumn(
  dataRows: string[][],
  column: number,
  tankCode: string,
  fuel: string,
  capacityCell: string
): BaremTank | null {
  const points = new Map<number, number>()
  const defects: BaremDefect[] = []
  // Heights the column lists but leaves without litres — a gap, as opposed to a
  // height the source left out of the sequence altogether.
  const missingHeights: number[] = []
  let listed: number | null = null
  let previous: { heightMm: number; liters: number } | null = null

  for (const row of dataRows) {
    const heightCell = (row[column] ?? '').trim()
    const litersCell = (row[column + 1] ?? '').trim()
    // Both cells empty means the column has ended: a shorter tank, not a gap.
    if (heightCell === '' && litersCell === '') continue

    const heightMm = parseVnNumber(heightCell)
    // An unreadable height (Google turned LAMDONG01's "51" into a date) loses the
    // row, which shows up as the jump in the sequence below.
    if (heightMm === null) continue
    if (listed !== null && heightMm - listed > 1) {
      defects.push({ kind: 'skipped-heights', afterHeightMm: listed, nextHeightMm: heightMm })
    }
    listed = heightMm

    const liters = parseVnNumber(litersCell)
    if (liters === null) {
      missingHeights.push(heightMm)
      continue
    }

    const kept = points.get(heightMm)
    if (kept !== undefined) {
      defects.push({ kind: 'duplicate-height', heightMm, liters, keptLiters: kept })
      continue
    }
    points.set(heightMm, liters)

    if (previous && liters < previous.liters) {
      defects.push({
        kind: 'litres-fell',
        heightMm,
        liters,
        previousHeightMm: previous.heightMm,
        previousLiters: previous.liters,
      })
    }
    previous = { heightMm, liters }
  }

  defects.push(...runsOfMissingPoints(missingHeights))

  // The range runs to the highest height that has litres. Where a gap runs to the
  // end of a column (DAKNONGVK Hầm 3, 2071–2380) the Barem therefore stops at
  // 2070 and those heights answer "above maximum", while the gap still stands in
  // the defect list for Trường Thịnh to fix.
  const heights = [...points.keys()]
  if (heights.length === 0) return null
  return {
    tankCode,
    fuel,
    nominalCapacityLiters: parseVnNumber(capacityCell),
    minHeightMm: Math.min(...heights),
    maxHeightMm: Math.max(...heights),
    points,
    defects,
  }
}

/** Groups heights that carry no litres into the contiguous ranges the report names. */
function runsOfMissingPoints(missingHeights: number[]): BaremDefect[] {
  const runs: BaremDefect[] = []
  let from: number | null = null
  let to = 0
  let count = 0

  for (const heightMm of missingHeights) {
    if (from !== null && heightMm !== to + 1) {
      runs.push(missingPointsRun(from, to, count))
      from = null
    }
    if (from === null) {
      from = heightMm
      count = 0
    }
    to = heightMm
    count += 1
  }
  if (from !== null) runs.push(missingPointsRun(from, to, count))
  return runs
}

function missingPointsRun(fromHeightMm: number, toHeightMm: number, count: number): BaremDefect {
  return { kind: 'missing-points', fromHeightMm, toHeightMm, count }
}

/**
 * Resolves a measured height against one Hầm's Barem. The match is an exact
 * millimetre — a fractional height is rounded first, and nothing is
 * interpolated. A miss returns the reason, so the form can say why.
 */
export function lookupBaremLiters(
  column: BaremColumn | null | undefined,
  heightMm: number
): BaremLookup {
  if (!column) return { ok: false, reason: 'unknown-tank' }
  const millimetre = Math.round(heightMm)
  if (millimetre < column.minHeightMm) return { ok: false, reason: 'below-minimum' }
  if (millimetre > column.maxHeightMm) return { ok: false, reason: 'above-maximum' }
  const liters = column.points.get(millimetre)
  if (liters === undefined) return { ok: false, reason: 'missing-point' }
  return { ok: true, liters }
}

/**
 * What the Hầm received: barem(after) − barem(before). It auto-fills only when
 * the level rose. Zero means the tank took nothing; negative means the tank
 * fell, which is reported with the figure rather than offered as a fill value.
 */
export function baremIntake(before: BaremLookup, after: BaremLookup): BaremIntake {
  if (!before.ok) return { fill: false, reason: before.reason, side: 'before' }
  if (!after.ok) return { fill: false, reason: after.reason, side: 'after' }
  const deltaLiters = after.liters - before.liters
  if (deltaLiters > 0) return { fill: true, liters: deltaLiters }
  if (deltaLiters === 0) return { fill: false, reason: 'no-change' }
  return { fill: false, reason: 'tank-fell', deltaLiters }
}

/** Minimal RFC 4180 reader: quoted fields, doubled quotes, CRLF or LF rows. */
function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i]
    if (quoted) {
      if (char !== '"') {
        field += char
      } else if (csv[i + 1] === '"') {
        field += '"'
        i += 1
      } else {
        quoted = false
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && csv[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}
