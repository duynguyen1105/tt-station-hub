// The importer's report. It is a deliverable for Trường Thịnh (ADR 0003), not
// developer output: the arithmetic errors it lists are in their spreadsheet,
// which means they are wrong wherever else that spreadsheet is used. So it
// speaks their vocabulary — Trạm, Hầm, chiều cao, lít — and names the height and
// the litres at every defect rather than the row it sat on.
//
// Pure: it formats what the importer found and compares two sets of numbers.
// It corrects nothing on either side.
import { formatDateTime } from '@/lib/format'

import type { BaremDefect, BaremSheet, BaremTank } from './barem'

/** A Hầm as the `dispensers` table knows it. */
export type DispenserTank = {
  tankCode: string | null
  fuelType: string
  /** Thousands of litres, as the column stores it — 25 means a 25,000 L tank. */
  tankCapacityK: number | null
}

/** What the sheet says about a Hầm, for comparison against the dispensers. */
type SheetTank = Pick<BaremTank, 'tankCode' | 'fuel' | 'nominalCapacityLiters'>

/** A disagreement between the Barem sheet and the `dispensers` table. */
export type BaremMismatch =
  | { kind: 'fuel'; tankCode: string; sheetFuel: string; dispenserFuels: string[] }
  | {
      kind: 'capacity'
      tankCode: string
      sheetCapacityLiters: number | null
      dispenserCapacitiesLiters: number[]
    }
  | { kind: 'tank-missing-from-dispensers'; tankCode: string }
  | { kind: 'tank-missing-from-sheet'; tankCode: string; dispenserFuels: string[] }

/** One Trạm's sheet, as the importer left it. */
export type BaremStationOutcome =
  | {
      ok: true
      stationCode: string
      stationName: string
      tab: string
      sheet: BaremSheet
      mismatches: BaremMismatch[]
    }
  | { ok: false; stationCode: string; stationName: string; tab: string; error: string }

/**
 * Lines up one Trạm's Barem against its dispensers. A Barem bound to the wrong
 * tank shows up here as a fuel or capacity disagreement — which is the point of
 * the check; neither side is corrected.
 */
export function compareBaremToDispensers(
  sheetTanks: SheetTank[],
  dispensers: DispenserTank[]
): BaremMismatch[] {
  const byTank = new Map<string, DispenserTank[]>()
  for (const d of dispensers) {
    if (!d.tankCode) continue
    byTank.set(d.tankCode, [...(byTank.get(d.tankCode) ?? []), d])
  }

  const mismatches: BaremMismatch[] = []
  for (const tank of sheetTanks) {
    const drawing = byTank.get(tank.tankCode)
    if (!drawing) {
      mismatches.push({ kind: 'tank-missing-from-dispensers', tankCode: tank.tankCode })
      continue
    }

    // Several trụ can draw from one Hầm; they should all name the same fuel, and
    // the sheet only has to agree with one of them to be consistent.
    const dispenserFuels = distinct(drawing.map((d) => d.fuelType))
    if (!dispenserFuels.includes(tank.fuel)) {
      mismatches.push({
        kind: 'fuel',
        tankCode: tank.tankCode,
        sheetFuel: tank.fuel,
        dispenserFuels,
      })
    }

    const dispenserCapacitiesLiters = distinct(
      drawing.flatMap((d) => (d.tankCapacityK === null ? [] : [d.tankCapacityK * 1000]))
    )
    if (
      dispenserCapacitiesLiters.length > 0 &&
      (tank.nominalCapacityLiters === null ||
        !dispenserCapacitiesLiters.includes(tank.nominalCapacityLiters))
    ) {
      mismatches.push({
        kind: 'capacity',
        tankCode: tank.tankCode,
        sheetCapacityLiters: tank.nominalCapacityLiters,
        dispenserCapacitiesLiters,
      })
    }
  }

  const inSheet = new Set(sheetTanks.map((t) => t.tankCode))
  for (const [tankCode, drawing] of byTank) {
    if (inSheet.has(tankCode)) continue
    mismatches.push({
      kind: 'tank-missing-from-sheet',
      tankCode,
      dispenserFuels: distinct(drawing.map((d) => d.fuelType)),
    })
  }

  return mismatches
}

/** The whole run, as a page a human can hand to Trường Thịnh. */
export function formatBaremReport(outcomes: BaremStationOutcome[], importedAt: Date): string {
  const lines = [`BÁO CÁO NHẬP BAREM — ${formatDateTime(importedAt)}`]

  for (const outcome of outcomes) {
    lines.push('', '─'.repeat(72))
    const who = `${outcome.stationName} (${outcome.stationCode}) — trang tính \`${outcome.tab}\``
    if (!outcome.ok) {
      // The importer writes last, so a skipped Trạm still holds the Barem it had
      // before this run — whatever the reason turns out to be.
      lines.push(`${who}: KHÔNG NHẬP ĐƯỢC (giữ barem cũ) — ${outcome.error}`)
      continue
    }

    lines.push(`${who}, ô A1: "${outcome.sheet.stationHeader}"`)
    for (const tank of outcome.sheet.tanks) {
      lines.push(`  ${describeTank(tank)}`)
      for (const defect of tank.defects) lines.push(`    • ${describeDefect(defect)}`)
    }
    if (outcome.mismatches.length > 0) {
      lines.push('  Sai lệch so với bảng dispensers (không sửa bên nào):')
      for (const mismatch of outcome.mismatches) lines.push(`    • ${describeMismatch(mismatch)}`)
    }
  }

  const importedSheets = outcomes.filter((o) => o.ok)
  const tanks = importedSheets.flatMap((o) => o.sheet.tanks)
  lines.push(
    '',
    '─'.repeat(72),
    'TỔNG KẾT',
    `  Trang tính nhập được: ${importedSheets.length}/${outcomes.length}`,
    `  Hầm nhập được: ${tanks.length}`,
    `  Điểm chiều cao → lít: ${grouped(tanks.reduce((n, t) => n + t.points.size, 0))}`,
    `  Lỗi trong nguồn: ${tanks.reduce((n, t) => n + t.defects.length, 0)}`,
    `  Sai lệch so với dispensers: ${importedSheets.reduce((n, o) => n + o.mismatches.length, 0)}`
  )
  return lines.join('\n')
}

function describeTank(tank: BaremTank): string {
  const capacity =
    tank.nominalCapacityLiters === null
      ? 'không ghi dung tích'
      : `dung tích danh nghĩa ${grouped(tank.nominalCapacityLiters)} L`
  return (
    `${hamLabel(tank.tankCode)} — ${tank.fuel}, ${capacity}, ` +
    `${grouped(tank.minHeightMm)}–${grouped(tank.maxHeightMm)} mm, ${grouped(tank.points.size)} điểm`
  )
}

function describeDefect(defect: BaremDefect): string {
  switch (defect.kind) {
    case 'litres-fell':
      return (
        `Lít giảm khi chiều cao tăng: ${grouped(defect.previousHeightMm)} mm = ` +
        `${grouped(defect.previousLiters)} L → ${grouped(defect.heightMm)} mm = ` +
        `${grouped(defect.liters)} L (hụt ${grouped(defect.previousLiters - defect.liters)} L)`
      )
    case 'missing-points':
      return (
        `Thiếu số lít: ${grouped(defect.fromHeightMm)}–${grouped(defect.toHeightMm)} mm ` +
        `(${grouped(defect.count)} chiều cao không tra được)`
      )
    case 'skipped-heights':
      return `Bỏ qua chiều cao: sau ${grouped(defect.afterHeightMm)} mm nhảy tới ${grouped(defect.nextHeightMm)} mm`
    case 'duplicate-height':
      return (
        `Chiều cao ghi hai lần: ${grouped(defect.heightMm)} mm = ${grouped(defect.keptLiters)} L ` +
        `và ${grouped(defect.liters)} L (lấy ${grouped(defect.keptLiters)} L)`
      )
  }
}

function describeMismatch(mismatch: BaremMismatch): string {
  const ham = hamLabel(mismatch.tankCode)
  switch (mismatch.kind) {
    case 'fuel':
      return `${ham}: nhiên liệu — barem ghi ${mismatch.sheetFuel}, dispensers ghi ${mismatch.dispenserFuels.join(' / ')}`
    case 'capacity':
      return (
        `${ham}: dung tích — barem ghi ` +
        `${mismatch.sheetCapacityLiters === null ? 'không có' : `${grouped(mismatch.sheetCapacityLiters)} L`}, ` +
        `dispensers ghi ${mismatch.dispenserCapacitiesLiters.map((l) => `${grouped(l)} L`).join(' / ')}`
      )
    case 'tank-missing-from-dispensers':
      return `${ham}: có trong barem nhưng không có trong dispensers`
    case 'tank-missing-from-sheet':
      return `${ham}: có trong dispensers (${mismatch.dispenserFuels.join(' / ')}) nhưng không có trong barem`
  }
}

/** "HAM_3" → "Hầm 3" — the report speaks the station's language, not the schema's. */
function hamLabel(tankCode: string): string {
  return tankCode.replace('HAM_', 'Hầm ')
}

/** Grouped like the spreadsheet itself writes them: 13,532. */
function grouped(value: number): string {
  return value.toLocaleString('en-US')
}

function distinct<T>(values: T[]): T[] {
  return [...new Set(values)]
}
