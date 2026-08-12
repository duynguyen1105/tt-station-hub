// The binding ladder: one rule for turning a row label on a biên bản into the
// Hầm or Trụ it names, and — when it cannot — into a reason rather than a silent
// nothing (ADR 0004).
//
// The rungs, in order:
//   1. a number is present   → that Hầm, unless the printed fuel or capacity
//                              contradicts the roster, or an earlier row on the
//                              same biên bản already claimed it;
//   2. no number             → the roster entry the printed fuel and capacity
//                              single out. Zero or several leave the row unbound;
//   3. the old `HẦM n` shape binds by rung 1, so a Trạm still working through a
//      drawer of old sheets is unaffected. This is not a cutover.
//
// The roster is the caller's to choose — the database when the Trạm is
// configured, `station-rosters.ts` otherwise — so a real delivery is never lost
// to a Trạm nobody has set up yet. This module reads no database and has no side
// effects.

/** Why a row could not be bound. The form's wording is driven by the reason, as
 *  the Barem's refusals already are. */
export type BindingRefusal =
  /** An earlier row on the same biên bản already claimed that Hầm. */
  | 'duplicate-number'
  /** The printed fuel or capacity contradicts what the roster holds. */
  | 'roster-mismatch'
  /** No number printed, and the fuel and capacity name no single roster entry. */
  | 'unidentified'

/** A bound row carries the code; `verified: false` means the roster had nothing
 *  to check it against, not that the check passed. */
export type TankBinding =
  | { bound: true; tankCode: string; verified: boolean }
  | { bound: false; reason: BindingRefusal }

export type PumpBinding =
  | { bound: true; pumpCode: string; verified: boolean }
  | { bound: false; reason: BindingRefusal }

/** What one row of the printed table says about itself. */
export type PaperLabel = {
  number: number | null
  /** `E0` | `EA` | `DO` | `DC`, when the label prints one. */
  fuel: string | null
  /** Thousands of litres, as the form writes them — `10K` is 10. */
  capacityK: number | null
}

/** The roster as the ladder needs it: what the app knows about one Hầm. The
 *  paper roster's `RosterTank` is one of these; a database row is mapped to it. */
export type TankRosterEntry = { tankCode: string; fuel: string | null; capacityK: number | null }

export type PumpRosterEntry = { pumpCode: string; fuel: string | null }

/** Internal shape both ladders run on — a Trụ is a Hầm without a capacity. */
type RosterEntry = { code: string; fuel: string | null; capacityK: number | null }

/**
 * Binds every Hầm row of one biên bản, in printed order. Order matters: the
 * first row to claim a Hầm keeps it, and a later row naming the same Hầm is
 * unbound rather than booked against a Hầm that already received the delivery.
 */
export function bindTankLabels(
  labels: string[],
  roster: readonly TankRosterEntry[]
): TankBinding[] {
  return bindAll(labels, roster.map(tankEntry), 'HAM').map((binding) =>
    binding.bound ? { bound: true, tankCode: binding.code, verified: binding.verified } : binding
  )
}

/** The same ladder against the Trụ roster, which prints no capacities. */
export function bindPumpLabels(
  labels: string[],
  roster: readonly PumpRosterEntry[]
): PumpBinding[] {
  return bindAll(labels, roster.map(pumpEntry), 'TRU').map((binding) =>
    binding.bound ? { bound: true, pumpCode: binding.code, verified: binding.verified } : binding
  )
}

type Binding =
  | { bound: true; code: string; verified: boolean }
  | { bound: false; reason: BindingRefusal }

function bindAll(labels: string[], roster: RosterEntry[], prefix: string): Binding[] {
  const claimed = new Set<string>()
  return labels.map((label) => {
    const binding = bindLabel(label, roster, prefix, claimed)
    if (binding.bound) claimed.add(binding.code)
    return binding
  })
}

/** One rung at a time. Never returns nothing: an unbound row says why. */
function bindLabel(
  label: string,
  roster: RosterEntry[],
  prefix: string,
  claimed: ReadonlySet<string>
): Binding {
  const printed = parsePaperLabel(label)

  if (printed.number !== null) {
    const code = `${prefix}_${printed.number}`
    // Every entry printed under that number — HTGDONGNAI prints two Hầm `3.`,
    // so agreeing with either is agreeing with the roster.
    const known = roster.filter((entry) => entry.code === code)
    if (known.length > 0 && !known.some((entry) => agrees(entry, printed))) {
      return { bound: false, reason: 'roster-mismatch' }
    }
    if (claimed.has(code)) return { bound: false, reason: 'duplicate-number' }
    // A number the roster does not list is bound unverified rather than refused:
    // there is nothing to contradict it, and a delivery that happened must not
    // be lost to a roster nobody has filled in.
    return { bound: true, code, verified: known.length > 0 }
  }

  // Nothing printed at all names nothing, even at a Trạm with a single Hầm.
  if (printed.fuel === null && printed.capacityK === null) {
    return { bound: false, reason: 'unidentified' }
  }
  const matches = roster.filter((entry) => agrees(entry, printed))
  const match = matches.length === 1 ? matches[0] : undefined
  if (!match) return { bound: false, reason: 'unidentified' }
  if (claimed.has(match.code)) return { bound: false, reason: 'duplicate-number' }
  return { bound: true, code: match.code, verified: true }
}

/** The paper contradicts the roster only where both sides know the field. */
function agrees(entry: RosterEntry, printed: PaperLabel): boolean {
  if (printed.fuel !== null && entry.fuel !== null && printed.fuel !== entry.fuel) return false
  if (
    printed.capacityK !== null &&
    entry.capacityK !== null &&
    printed.capacityK !== entry.capacityK
  ) {
    return false
  }
  return true
}

/** The fuels the biên bản chuẩn prints — its goods columns are fixed at
 *  `E0 / EA / DO / DC`, and EA is E5, a different product from E0. */
const PRINTED_FUEL = /\b(E0|EA|DC|DO)\b/u
/** `HẦM 2 12K`, `Hầm 03`, `TRỤ 1` — the old shape, and what the AI still reads. */
const KEYWORD_NUMBER = /(?:H[ẦẤÂA]M|TR[ỤU])\s*0*(\d+)/u
/** `1. DO 10K`, `2.E0 - 12K`, `1- DO` — a leading number, then a separator. The
 *  separator is what keeps `10K` from reading as Hầm 10. */
const LEADING_NUMBER = /^\s*0*(\d+)\s*(?:[.\-–)]|\s)/u
/** `12K`, `- 9K`, ` 25K` — thousands of litres. */
const PRINTED_CAPACITY = /(\d+)\s*K\b/u

/** Reads a printed row label for the three things the ladder asks of it. */
export function parsePaperLabel(label: string): PaperLabel {
  const text = label.toUpperCase()
  const number = text.match(KEYWORD_NUMBER) ?? text.match(LEADING_NUMBER)
  const fuel = text.match(PRINTED_FUEL)
  const capacity = text.match(PRINTED_CAPACITY)
  return {
    number: number ? Number(number[1]) : null,
    fuel: fuel ? (fuel[1] ?? null) : null,
    capacityK: capacity ? Number(capacity[1]) : null,
  }
}

function tankEntry(tank: TankRosterEntry): RosterEntry {
  return { code: tank.tankCode, fuel: tank.fuel, capacityK: tank.capacityK }
}

function pumpEntry(pump: PumpRosterEntry): RosterEntry {
  return { code: pump.pumpCode, fuel: pump.fuel, capacityK: null }
}
