// Which Trạm the biên bản in the photo says it belongs to (ADR 0006).
//
// The biên bản chuẩn prints its Trạm in the header, with the code in brackets:
// `CỬA HÀNG BÁN LẺ XĂNG DẦU TRƯỜNG THỊNH SỐ 2 (DAKNONG2)`. The wizard's Trạm
// comes from the URL and is otherwise taken on trust, so a DAKNONG2 sheet
// photographed on DAKNONG1's Tồn kho page would bind its rows against DAKNONG1's
// Hầm and book another Trạm's litres into these tanks.
//
// This module answers that one question and nothing else. Like the binding
// ladder it may only ever *refuse* — a header it cannot place confidently comes
// back `unknown`, never a guess, because the caller turns a mismatch into a hard
// block and a misread must not cost a Trạm its delivery. It reads no database.
import { normalizeStationLabel, stripZeroPadding } from '@/lib/matching/station-label'

/** A Trạm as this module needs it — the database row and the paper roster both
 *  reduce to this. */
export type StationIdentity = { code: string; name: string }

/** The header names a Trạm we know, and it is not this one. Carries both sides,
 *  because the only useful thing to say to the reviewer names both. */
export type StationMismatch = {
  verdict: 'mismatch'
  /** The header as printed, for the reviewer to check against the photo. */
  paperLabel: string
  paperCode: string
  /** Null for a Trạm known only from the printed rosters, which has no name. */
  paperName: string | null
  currentCode: string
  currentName: string
}

export type StationOnPaper =
  /** The header names this Trạm. */
  | { verdict: 'match' }
  | StationMismatch
  /** Nothing printed, or a header naming nobody we know. Never blocks: an old
   *  sheet prints no code, and a Trạm nobody has configured is not evidence. */
  | { verdict: 'unknown' }

/** Every bracketed group in the header — `(DAKNONG2)`, `(DAKNONG 3)`. */
const BRACKETED = /\(([^)]*)\)/g

/**
 * Places the station header of one biên bản against the Trạm being imported into.
 *
 * The rungs, in order:
 *   1. nothing printed              → `unknown`;
 *   2. a bracketed code — the header's own identity field — placed against this
 *      Trạm first, then the others. A bracket naming nobody falls through
 *      rather than deciding, since a bracket may hold something else entirely;
 *   3. the whole header, normalized. This Trạm is tested first, so a header that
 *      names us never loses to an incidental substring hit on a sibling code.
 *      Exactly one other Trạm matches → mismatch; zero or several → `unknown`.
 */
export function stationOnPaper(
  paperLabel: string | null | undefined,
  current: StationIdentity,
  others: readonly StationIdentity[]
): StationOnPaper {
  const label = paperLabel?.trim() ?? ''
  if (label === '') return { verdict: 'unknown' }

  const mine = variantsOf(current)

  for (const [, inside] of label.matchAll(BRACKETED)) {
    const bracket = normalized(inside ?? '')
    if (bracket === '') continue
    if (mine.has(bracket)) return { verdict: 'match' }
    const hit = others.find((station) => variantsOf(station).has(bracket))
    if (hit) return mismatch(label, hit, current)
  }

  const whole = normalized(label)
  if (whole === '') return { verdict: 'unknown' }
  if (mine.has(whole) || namesStation(whole, mine)) return { verdict: 'match' }

  // Several hits mean the header reads as more than one Trạm, which is no
  // identification at all. Distinct by *normalized* code, so the same Trạm
  // reached twice — once as a database row, once as a printed roster — counts
  // once, and the database row wins because it comes first and carries a name.
  const hits = others.filter((station) => {
    const theirs = variantsOf(station)
    return theirs.has(whole) || namesStation(whole, theirs)
  })
  const codes = new Set(hits.map((station) => normalized(station.code)))
  const only = codes.size === 1 ? hits[0] : undefined
  return only ? mismatch(label, only, current) : { verdict: 'unknown' }
}

function mismatch(
  label: string,
  station: StationIdentity,
  current: StationIdentity
): StationMismatch {
  return {
    verdict: 'mismatch',
    paperLabel: label,
    paperCode: station.code,
    paperName: station.name || null,
    currentCode: current.code,
    currentName: current.name,
  }
}

/** The header carries the Trạm's name plus a good deal of company boilerplate,
 *  so the code has to be found inside it. Only the code: a Trạm's *name*
 *  ("Trạm số 2") is short and common enough to hit by accident. */
function namesStation(whole: string, variants: ReadonlySet<string>): boolean {
  for (const variant of variants) {
    if (variant.length >= 4 && whole.includes(variant)) return true
  }
  return false
}

/** Every spelling of one Trạm: its code and its name, both normalized. */
function variantsOf(station: StationIdentity): Set<string> {
  const variants = new Set<string>()
  for (const value of [station.code, station.name]) {
    const norm = normalized(value)
    if (norm !== '') variants.add(norm)
  }
  return variants
}

/** Diacritics, case and punctuation dropped, then zero-padding collapsed — so
 *  `ĐAKNONG 1`, `Đắk Nông 1` and the code `DAKNONG_1` are one string, and so are
 *  `NGANHA01` and the printed `NGANHA 1`. */
function normalized(value: string): string {
  return stripZeroPadding(normalizeStationLabel(value))
}
