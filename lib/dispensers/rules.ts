// What a trụ may be written as. Pure — the shape a form submitted in, a refusal or
// nothing out — so Lắp and Chỉnh sửa cannot drift apart on rules both have to keep.
//
// The refusals are Vietnamese here rather than in the routes, in the style of
// lib/fuels/catalogue.ts: what a trụ may be is a fact of the rule, not of the screen.
import { tankCodeFor } from '@/lib/dispensers/naming'
import { vi } from '@/messages/vi'

/**
 * The two hầm columns a trụ is written with. Dung tích is a fact about the hầm, so a
 * trụ drawing from none carries none — otherwise the barem cross-check would be left
 * comparing a capacity against no hầm at all.
 */
export function tankFieldsFor(
  tankNumber: number | null,
  tankCapacityK: number | null
): { tankCode: string | null; tankCapacityK: number | null } {
  return tankNumber === null
    ? { tankCode: null, tankCapacityK: null }
    : { tankCode: tankCodeFor(tankNumber), tankCapacityK }
}

/** A trụ as it arrives from the form, in the parts that can be refused. */
export type DispenserShape = {
  tankNumber: number | null
  tankCapacityK: number | null
  hasElectronicMeter: boolean
  hasMechanicalMeter: boolean
}

/**
 * Why this trụ cannot be written, or null when it can.
 *
 * A **dung tích with no hầm** is refused rather than quietly dropped: `tankFieldsFor`
 * would null it, and a kế toán who typed 25 and got a success toast deserves to be told
 * the number went nowhere.
 *
 * A trụ with **no đồng hồ at all** is refused because it is not a trụ: every ca rule
 * that expects a chỉ số is keyed on a đồng hồ, so such a row would sit at a số trụ
 * forever without a ca ever asking it for anything.
 */
export function refuseDispenserShape(shape: DispenserShape): string | null {
  if (shape.tankNumber === null && shape.tankCapacityK !== null) {
    return vi.dispensers.capacityWithoutTank
  }
  if (!shape.hasElectronicMeter && !shape.hasMechanicalMeter) {
    return vi.dispensers.meterRequired
  }
  return null
}
