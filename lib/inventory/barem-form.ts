// What section (c) of the biên bản shows once the Barem has answered: which
// litres fill the SL barem cells, what the Hầm itself measured as its intake,
// and where the paper disagrees with either.
//
// ADR 0002 — the measured intake outranks the paper: the cells carry the
// Barem's figures rather than the AI's reading of the handwriting, and "Nhập
// vào hầm" is barem(after) − barem(before) rather than the delivery note's
// quantity. Both stay overtypable in the form; this module only decides what is
// offered. It reads no database and has no side effects.
import { type BaremLookup, type BaremRefusal, baremIntake } from './barem'

/** How far the AI's reading of the handwritten SL barem may sit from the Barem's
 *  own figure before the row shows it. The paper records whole litres, so a
 *  whole litre apart is a mis-copy rather than a rounding artifact. */
const PAPER_DISAGREEMENT_LITERS = 1

export type TankBaremInput = {
  /** The resolved height, or null while that side has no height measured yet. */
  before: BaremLookup | null
  after: BaremLookup | null
  /** The AI's reading of the handwritten SL barem, kept for the comparison. */
  paperBaremBefore: number | null
  paperBaremAfter: number | null
}

export type TankBaremResolution = {
  /** Litres for the SL barem cells; null leaves the cell empty. */
  baremBefore: number | null
  baremAfter: number | null
  /** The paper's figure, shown only where it disagrees with the Barem. */
  paperBefore: number | null
  paperAfter: number | null
  /** Litres for "Nhập vào hầm"; null fills nothing. */
  intakeLiters: number | null
  /** Why the Barem could not answer — one entry per distinct reason, so a row
   *  that fails the same way on both sides says so once. */
  reasons: BaremRefusal[]
  /** The drop, when the level fell during the delivery. Never a fill value. */
  fellLiters: number | null
}

export function resolveTankBarem(input: TankBaremInput): TankBaremResolution {
  // An unmeasured height is not a refusal — the row is simply not filled in yet.
  const intake = input.before && input.after ? baremIntake(input.before, input.after) : null
  return {
    baremBefore: input.before?.ok ? input.before.liters : null,
    baremAfter: input.after?.ok ? input.after.liters : null,
    paperBefore: paperDisagreement(input.before, input.paperBaremBefore),
    paperAfter: paperDisagreement(input.after, input.paperBaremAfter),
    intakeLiters: intake?.fill ? intake.liters : null,
    reasons: [...new Set([input.before, input.after].flatMap(refusalOf))],
    fellLiters: intake && !intake.fill && intake.reason === 'tank-fell' ? intake.deltaLiters : null,
  }
}

/** The paper's figure when it disagrees with the Barem — there is nothing to
 *  disagree with where the Barem could not answer. */
function paperDisagreement(
  computed: BaremLookup | null,
  paperLiters: number | null
): number | null {
  if (!computed?.ok || paperLiters === null) return null
  const gap = Math.abs(paperLiters - computed.liters)
  return gap >= PAPER_DISAGREEMENT_LITERS ? paperLiters : null
}

function refusalOf(lookup: BaremLookup | null): BaremRefusal[] {
  return lookup && !lookup.ok ? [lookup.reason] : []
}

/**
 * What a cell shows, and therefore what confirming the biên bản saves: the
 * reviewer's own figure once they type one, the Barem's otherwise. Clearing the
 * cell hands it back to the Barem. The paper is the legal record, so the human
 * always outranks the computation here.
 */
export function shownCell(typed: string, computed: number | null): string {
  if (typed !== '') return typed
  return computed === null ? '' : String(computed)
}

export type DeliveryNoteProduct = { productLabel: string; quantityLiters: number | null }

/**
 * The delivery note's quantity for what a Hầm holds — displayed beside the
 * measured intake as the comparison, never as the value (ADR 0002). Exactly one
 * column must name the Hầm's fuel: two columns of the same fuel leave the
 * attribution to the reviewer rather than to a guess here.
 */
export function deliveryNoteLiters(
  products: DeliveryNoteProduct[],
  fuelType: string | null
): number | null {
  if (!fuelType) return null
  const matching = products.filter(
    (p) => p.quantityLiters !== null && fuelTypeFromProductLabel(p.productLabel) === fuelType
  )
  return matching.length === 1 ? (matching[0]?.quantityLiters ?? null) : null
}

/**
 * The paper's product column ("RON 95", "E0", "DO 0,05S-V") read as one of the
 * app's fuel types, so a Hầm can be matched to what the tanker brought. An
 * unrecognised column resolves to nothing, and the row is simply offered no
 * comparison — a wrong attribution costs money, a missing one costs a glance.
 * The vocabulary is the app's own: the fuel codes the biên bản prompt gives the
 * AI (`lib/ai/prompts.ts`), plus the names the fuels are seeded under —
 * XANG_A95 is "Xăng RON 95" (`prisma/seed.ts`).
 *
 * E5 petrol is EA on the biên bản chuẩn, a different product from E0 and one no
 * Trạm stocks yet. It is named here only so an E5 column resolves to nothing
 * rather than falling through to the bare-"xăng" reading and landing on A95.
 */
export function fuelTypeFromProductLabel(label: string): string | null {
  const text = label.toUpperCase()
  if (/URE|ADBLUE/.test(text)) return 'URE'
  if (/\bDC\b/.test(text)) return 'DC'
  if (/\bDO\b|DIESEL/.test(text)) return 'DO'
  if (/95/.test(text)) return 'XANG_A95'
  if (/\bE0\b/.test(text)) return 'E0'
  if (/\bEA\b|\bE5\b|92/.test(text)) return null
  if (/X[ĂA]NG/u.test(text)) return 'XANG_A95'
  return null
}
