// Which rows section (c) of the review form shows, and which Hầm each one is.
//
// The Trạm's own Hầm come first, as they always have. Every row the biên bản
// printed is then run through the binding ladder (ADR 0004): a bound row is that
// Hầm's row — its heights resolve against the Barem, "Nhập vào hầm" is measured
// from them, and confirming creates a phiếu nhập (ADR 0002). An unbound row
// keeps everything the paper said and carries the reason it could not be
// attributed; it produces no Barem lookup and no phiếu nhập, and it never stops
// the biên bản — the legal record — from being saved.
//
// Pure: no database, no side effects, and the extraction it is handed is left
// exactly as the AI returned it.
import { type ReceiptTankCheck, type TankSideCheck } from './bien-ban'
import { type BindingRefusal, type TankRosterEntry, bindTankLabels } from './binding-ladder'

/** A Hầm as the database holds it — a Trạm that has been configured. */
export type StationTank = {
  tankCode: string
  fuelType: string | null
  /** Thousands of litres, as `dispensers.tank_capacity_k` records them. */
  capacityK: number | null
}

/** One row of section (c) as the form should show it. */
export type ReviewTankRow = {
  /** The label as printed on the paper, or the Hầm's own name where the biên bản
   *  said nothing about it. */
  tankLabel: string
  /** Null on a row the ladder could not attribute: it books nothing. */
  tankCode: string | null
  fuelType: string | null
  /** Why this row names no Hầm — the form's wording is driven by the reason. */
  refusal: BindingRefusal | null
  /** What the paper measured, or null on a Hầm the biên bản never mentioned. */
  checks: { before: TankSideCheck; after: TankSideCheck } | null
}

/**
 * Merges what the AI read off one biên bản into the Trạm's Hầm rows.
 *
 * The roster the ladder binds against is the **database** when the Trạm is
 * configured and the **printed roster** otherwise, so a real delivery is never
 * lost to a Trạm nobody has set up yet.
 */
export function reviewTankRows(
  stationTanks: readonly StationTank[],
  extracted: readonly ReceiptTankCheck[],
  paperRoster: readonly TankRosterEntry[]
): ReviewTankRow[] {
  const roster: TankRosterEntry[] =
    stationTanks.length > 0
      ? stationTanks.map((t) => ({
          tankCode: t.tankCode,
          fuel: t.fuelType,
          capacityK: t.capacityK,
        }))
      : [...paperRoster]

  const rows: ReviewTankRow[] = stationTanks.map((t) => ({
    tankLabel: tankName(t.tankCode),
    tankCode: t.tankCode,
    fuelType: t.fuelType,
    refusal: null,
    checks: null,
  }))
  const byCode = new Map(rows.map((row) => [row.tankCode, row]))

  // One binding pass over the whole biên bản, in printed order: the ladder needs
  // the order to know which row claimed a Hầm first.
  const bindings = bindTankLabels(
    extracted.map((t) => t.tankLabel),
    roster
  )
  extracted.forEach((paper, index) => {
    const binding = bindings[index]
    const checks = { before: paper.before, after: paper.after }
    if (!binding || !binding.bound) {
      rows.push({
        tankLabel: paper.tankLabel,
        tankCode: null,
        fuelType: null,
        refusal: binding ? binding.reason : 'unidentified',
        checks,
      })
      return
    }
    const seeded = byCode.get(binding.tankCode)
    if (seeded) {
      seeded.tankLabel = paper.tankLabel
      seeded.checks = checks
      return
    }
    // A Hầm the paper names and the Trạm's configuration does not — the roster's
    // business to explain (`pnpm roster:check`), not a reason to lose the row.
    const row: ReviewTankRow = {
      tankLabel: paper.tankLabel,
      tankCode: binding.tankCode,
      fuelType: rosterFuel(roster, binding.tankCode),
      refusal: null,
      checks,
    }
    rows.push(row)
    byCode.set(row.tankCode, row)
  })
  return rows
}

/** The fuel the roster attributes to a Hầm, where it says one thing about it. */
function rosterFuel(roster: readonly TankRosterEntry[], tankCode: string): string | null {
  const fuels = new Set(
    roster.filter((entry) => entry.tankCode === tankCode).map((entry) => entry.fuel)
  )
  const only = fuels.size === 1 ? [...fuels][0] : null
  return only ?? null
}

function tankName(tankCode: string): string {
  return tankCode.replace('HAM_', 'Hầm ')
}
