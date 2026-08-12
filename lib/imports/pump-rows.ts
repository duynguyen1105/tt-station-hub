// Which rows section (d) of the review form shows, and what a moving Trụ means
// for section (c).
//
// Section (d) exists to prove nothing was sold while the Hầm were being
// measured. A row that is simply absent proves nothing while looking as though
// it does, so the rows are the Trạm's own Trụ — seeded from the roster, exactly
// as section (c)'s Hầm rows are — and what the biên bản printed is bound onto
// them through the ladder (ADR 0004). A Trụ the AI never read stays an empty
// row; a Trụ the roster does not know is kept rather than dropped.
//
// And the app knows which Hầm each Trụ draws from. So a non-zero difference is
// not a local oddity: fuel was leaving that Hầm while its height was being
// measured, which makes the measured intake in section (c) suspect. `tankTaints`
// says which Hầm rows that reaches. It is a cue for the reviewer, never a
// verdict — the paper is the legal record and the human confirming it has the
// last word.
//
// Pure: no database, no side effects, and the extraction it is handed is left
// exactly as the AI returned it.
import { type PumpSideCheck, type ReceiptPumpCheck } from './bien-ban'
import { type PumpRosterEntry, bindPumpLabels } from './binding-ladder'

/** A Trụ as the database holds it — a Trạm that has been configured. */
export type StationPump = {
  pumpCode: string
  fuelType: string | null
  /** The Hầm this Trụ draws from, as `dispensers.tank_code` records it. */
  tankCode: string | null
}

/** One row of section (d) as the form should show it. */
export type ReviewPumpRow = {
  /** The label as printed on the paper, or the Trụ's own name where the biên
   *  bản said nothing about it. */
  pumpLabel: string
  /** Null on a row the ladder could not attribute to any Trụ. */
  pumpCode: string | null
  /** The Hầm a difference on this row would taint, where the Trạm says one. */
  tankCode: string | null
  /** What the paper read off the totalisers, or null on a Trụ it never mentioned. */
  checks: { before: PumpSideCheck; after: PumpSideCheck } | null
}

/**
 * The Trạm's Trụ as section (d) needs them, in printed number order — (d)
 * mirrors the biên bản's numbered rows, not the app's own `displayOrder`, and
 * the same order then holds wherever the form is opened from.
 */
export function stationPumpsFromDispensers(
  dispensers: readonly { code: string; fuelType: string; tankCode: string | null }[]
): StationPump[] {
  return dispensers
    .map((d) => ({ pumpCode: d.code, fuelType: d.fuelType, tankCode: d.tankCode }))
    .sort((a, b) => a.pumpCode.localeCompare(b.pumpCode, undefined, { numeric: true }))
}

/** The roster as this module needs it, whichever side it came from. */
type PumpSeed = { pumpCode: string; fuel: string | null; tankCode: string | null }

/**
 * Merges what the AI read off one biên bản into the Trạm's Trụ rows.
 *
 * The roster is the **database** when the Trạm is configured and the **printed
 * roster** otherwise — the same choice section (c) makes, so a real delivery is
 * never lost to a Trạm nobody has set up yet. Only the database says which Hầm
 * a Trụ draws from; on the paper roster's word alone a Trụ taints nothing.
 */
export function reviewPumpRows(
  stationPumps: readonly StationPump[],
  extracted: readonly ReceiptPumpCheck[],
  paperRoster: readonly PumpRosterEntry[]
): ReviewPumpRow[] {
  const roster: PumpSeed[] =
    stationPumps.length > 0
      ? stationPumps.map((p) => ({ pumpCode: p.pumpCode, fuel: p.fuelType, tankCode: p.tankCode }))
      : paperRoster.map((p) => ({ pumpCode: p.pumpCode, fuel: p.fuel, tankCode: null }))

  const rows: ReviewPumpRow[] = roster.map((p) => ({
    pumpLabel: pumpName(p.pumpCode),
    pumpCode: p.pumpCode,
    tankCode: p.tankCode,
    checks: null,
  }))
  const byCode = new Map(rows.map((row) => [row.pumpCode, row]))

  // One binding pass over the whole biên bản, in printed order: the ladder needs
  // the order to know which row claimed a Trụ first.
  const bindings = bindPumpLabels(
    extracted.map((p) => p.pumpLabel ?? ''),
    roster.map((p) => ({ pumpCode: p.pumpCode, fuel: p.fuel }))
  )
  extracted.forEach((paper, index) => {
    const binding = bindings[index]
    const checks = { before: paper.before, after: paper.after }
    const bound = binding?.bound ? binding.pumpCode : null
    const seeded = bound === null ? undefined : byCode.get(bound)
    if (seeded) {
      if (paper.pumpLabel) seeded.pumpLabel = paper.pumpLabel
      seeded.checks = checks
      return
    }
    // A Trụ the paper names and the roster does not — the roster's business to
    // explain (`pnpm roster:check`), not a reason to lose a totaliser reading.
    // The row keeps its printed label and says no more: the ladder's refusals
    // are worded about a Hầm, and section (d) books nothing for the reason to
    // bear on.
    const row: ReviewPumpRow = {
      pumpLabel: paper.pumpLabel || (bound === null ? '' : pumpName(bound)),
      pumpCode: bound,
      tankCode: null,
      checks,
    }
    rows.push(row)
    if (bound !== null) byCode.set(bound, row)
  })
  return rows
}

/**
 * The litres a Trụ moved during the delivery, from its two totaliser
 * differences. The electronic one is what the app counts sales by, so it
 * answers first — but a still electronic totaliser does not silence a mechanical
 * one that moved. Either reading means fuel may have been leaving the Hầm, and
 * the taint is the reviewer's cue rather than a verdict.
 */
export function movedLiters(electronic: number | null, mechanical: number | null): number | null {
  return electronic || mechanical
}

/** One Trụ that moved during the delivery. */
export type PumpMovement = { pumpCode: string; liters: number }

/** One Trụ's totalisers as section (d) resolved them. */
export type PumpReading = {
  pumpCode: string | null
  /** The Hầm this Trụ draws from, where the Trạm configured one. */
  tankCode: string | null
  /** After − before; null where the paper gave nothing to subtract. */
  movedLiters: number | null
}

/**
 * The moving Trụ that contaminate each Hầm's measurement, keyed by Hầm and in
 * row order — two Trụ on one Hầm belong to one warning, not to two competing
 * ones. A Trụ that stood still, that the ladder could not attribute, or that
 * draws from no configured Hầm taints nothing.
 */
export function tankTaints(readings: readonly PumpReading[]): Map<string, PumpMovement[]> {
  const taints = new Map<string, PumpMovement[]>()
  for (const reading of readings) {
    if (!reading.pumpCode || !reading.tankCode) continue
    if (reading.movedLiters === null || reading.movedLiters === 0) continue
    const moved = taints.get(reading.tankCode) ?? []
    moved.push({ pumpCode: reading.pumpCode, liters: reading.movedLiters })
    taints.set(reading.tankCode, moved)
  }
  return taints
}

export function pumpName(pumpCode: string): string {
  return pumpCode.replace('TRU_', 'Trụ ')
}
