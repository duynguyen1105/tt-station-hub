// What a trụ may be written as: the nhiên liệu it may pump, and whether the rest of the
// shape a form submitted holds together. Pure — a shape in, a refusal or the fields to
// write out — so Lắp and Chỉnh sửa cannot drift apart on rules both have to keep.
//
// The refusals are Vietnamese here rather than in the routes, in the style of
// lib/fuels/catalogue.ts: what a trụ may be is a fact of the rule, not of the screen.
import { vi } from '@/messages/vi'

/** A hầm in the parts its trụ carry a copy of. */
export type TankSource = { id: string; code: string; fuelType: string; capacityK: number | null }

/**
 * The columns a trụ drawing from `tank` is written with. The hầm is the root: the trụ
 * pumps what the hầm holds and repeats its code and dung tích, so the readers of those
 * columns (tồn kho, phiếu nhập, barem) see the hầm without knowing the table exists.
 * Written by the trụ routes and by the hầm route alike, so the copy has one shape.
 */
export function tankFieldsFor(tank: TankSource) {
  return {
    tankId: tank.id,
    fuelType: tank.fuelType,
    tankCode: tank.code,
    tankCapacityK: tank.capacityK,
  }
}

/**
 * The columns a trụ drawing from no hầm is written with — a URE trụ fed from a bồn
 * rời. It pumps the nhiên liệu it was given and carries no hầm columns, so the barem
 * cross-check is never left comparing a dung tích against no hầm at all.
 */
export function noTankFieldsFor(fuelType: string) {
  return { tankId: null, fuelType, tankCode: null, tankCapacityK: null }
}

/** A trụ as it arrives from the form, in the parts that can be refused. */
export type DispenserShape = {
  hasElectronicMeter: boolean
  hasMechanicalMeter: boolean
}

/**
 * Why this trụ cannot be written, or null when it can.
 *
 * A trụ with **no đồng hồ at all** is refused because it is not a trụ: every ca rule
 * that expects a chỉ số is keyed on a đồng hồ, so such a row would sit at a số trụ
 * forever without a ca ever asking it for anything.
 */
export function refuseDispenserShape(shape: DispenserShape): string | null {
  if (!shape.hasElectronicMeter && !shape.hasMechanicalMeter) {
    return vi.dispensers.meterRequired
  }
  return null
}

/** A nhiên liệu as an ô chọn shows it: the khóa it writes, and the tên it reads. */
export type DispenserFuelOption = { fuelType: string; name: string }

/**
 * The nhiên liệu a trụ may be written with: what the trạm declared it sells, plus
 * whatever the trụ already pumps.
 *
 * The trạm's rows are the choice — a trụ can never pump something the trạm has no mã
 * hàng, no giá and no hầm for. What the trụ already pumps is on the list because it is
 * not a choice: a trụ đã ngừng still holding a nhiên liệu the trạm has since stopped
 * selling, or one the danh mục has since ngừng, has to read back as what it pumps, and
 * an edit of its hầm or its đồng hồ must not be refused over a nhiên liệu it is not
 * changing.
 *
 * The route keeps the same rule from the other side: a nhiên liệu left alone passes,
 * and a change is checked against what the trạm sells. A hầm's ô chọn is drawn by the
 * same rule, for the same reasons.
 */
export function dispenserFuelOptions(
  sold: readonly DispenserFuelOption[],
  current?: DispenserFuelOption
): DispenserFuelOption[] {
  return current && !sold.some((fuel) => fuel.fuelType === current.fuelType)
    ? [...sold, current]
    : [...sold]
}
