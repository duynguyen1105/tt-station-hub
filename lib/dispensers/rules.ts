// Shared rules for a trụ's nhiên liệu and đồng hồ, used by both Lắp and Chỉnh sửa.
import { vi } from '@/messages/vi'

/** Chosen hầm determine the trụ's nhiên liệu; with none, its own selection is required. */
export function dispenserFuelFor(
  tanks: readonly { fuelType: string }[],
  ownFuel: string | null
): { fuelType: string } | { refusal: string } {
  const first = tanks[0]
  if (!first) {
    return ownFuel ? { fuelType: ownFuel } : { refusal: vi.dispensers.fuelRequired }
  }
  const fuelType = first.fuelType
  return tanks.every((tank) => tank.fuelType === fuelType)
    ? { fuelType }
    : { refusal: vi.dispensers.tanksMixedFuel }
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
