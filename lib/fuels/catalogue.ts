// Every rule the danh mục nhiên liệu adds. Pure — plain values in, plain values
// out — so the rules are testable without React or Prisma, in the style of
// retail-price-board.ts and photo-to-reading.ts.
//
// The refusal to xoá is written here rather than in the route, so the Vietnamese it
// speaks is a fact of the rule and not of the screen that shows it.
import { vi } from '@/messages/vi'

/**
 * The khóa nhiên liệu generated from a tên: "Xăng RON 98" -> "XANG_RON_98".
 * Named for what it produces — the string every table stores as `fuelType`.
 * Diacritics are stripped (đ included), everything that is not a letter or a
 * digit collapses to one underscore, and the edges carry none.
 *
 * A nhiên liệu keeps its khóa for life, so this runs once at creation and the tên
 * is free to change afterwards. The five founding nhiên liệu are the exception:
 * their khóa predate this rule and are seeded literally (prisma/seed.ts), so four
 * of the five are not what this function would produce from their tên.
 */
export function generateFuelType(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * One nhiên liệu of the danh mục, as the screens that read it need it. The khóa is
 * what every other table stores; the tên is what kế toán sees; `areaIndependent` says
 * whether one giá covers the whole nước; `isActive` says whether Trường Thịnh still
 * sells it. No id — nothing that reads a danh mục addresses the row it came from.
 *
 * A nhiên liệu đã ngừng is off every ô chọn and takes no new giá, but keeps its row so
 * that a past ca, phiếu nhập or công nợ still renders its tên.
 */
export type CatalogueFuel = {
  fuelType: string
  name: string
  areaIndependent: boolean
  isActive: boolean
}

/**
 * The tên a khóa reads as, taken from the danh mục — the only thing in the app that
 * answers what a nhiên liệu is called, now that the message bundle's five-fuel map is
 * gone (ticket 07). The five founding nhiên liệu are rows of the danh mục like every
 * one added since.
 *
 * Pure, so a server component passes it the loader's danh mục and a client component
 * the provider's, and both get the same string. A khóa the danh mục does not answer for
 * renders as itself rather than blank — that is what keeps an old ca, phiếu nhập or
 * công nợ row readable. Nhiên liệu đã ngừng are in the danh mục both sides carry, so
 * they resolve to their tên like any other.
 */
export function fuelTypeLabelFrom(catalogue: readonly CatalogueFuel[], fuelType: string): string {
  return catalogue.find((fuel) => fuel.fuelType === fuelType)?.name ?? fuelType
}

/**
 * The nhiên liệu an ô chọn may offer: the ones Trường Thịnh still sells, in the danh
 * mục's own order. Every fuel picker in the app asks here rather than filtering for
 * itself, so Ngừng sử dụng removes a nhiên liệu from all of them at once.
 *
 * The counterpart of `fuelTypeLabelFrom`, which deliberately does not filter: a nhiên
 * liệu đã ngừng cannot be chosen for a new row but still reads as its tên on every old
 * one.
 */
export function selectableFuels(catalogue: readonly CatalogueFuel[]): CatalogueFuel[] {
  return catalogue.filter((fuel) => fuel.isActive)
}

/**
 * The nhiên liệu a trạm may take on: what it still sells, minus what the trạm already
 * has a Map nhiên liệu row for. A trạm handles a nhiên liệu iff it has a row for it,
 * so the row is the declaration and this is what Thêm nhiên liệu offers — the one-row
 * per (trạm, nhiên liệu) constraint is never reached, because the picker cannot name a
 * nhiên liệu the trạm already declared.
 *
 * A nhiên liệu đã ngừng is never offered, mapped or not: a trạm cannot start selling
 * what Trường Thịnh stopped selling, and one it mapped before then keeps its row.
 */
export function addableFuels(
  catalogue: readonly CatalogueFuel[],
  mapped: readonly string[]
): CatalogueFuel[] {
  return selectableFuels(catalogue).filter((fuel) => !mapped.includes(fuel.fuelType))
}

/**
 * How many rows of each kind hold one nhiên liệu. Every table below stores the khóa as
 * a plain string rather than a foreign key, so nothing in the database stops a row from
 * being deleted out from under them — this count is what does.
 */
export type FuelUsageCounts = {
  /** Trạm that have mapped it to a mã hàng MISA. */
  fuelMaps: number
  /** Trụ pumping it. */
  dispensers: number
  /** Kỳ giá bán lẻ recorded for it. */
  prices: number
  /** Tồn kho rows carrying it. */
  inventory: number
  /** Nhập, xuất and điều chỉnh written into the tồn kho ledger for it. */
  movements: number
  /** Số đầu kỳ anchors for it. */
  openingBalances: number
  /** Phiếu nhập of it. */
  imports: number
  /** Đo hầm readings written against it. */
  tankDips: number
  /** Lượt bán nợ of it. */
  debtVisits: number
}

/** Xoá outright, or refuse and offer Ngừng sử dụng with the reasons kế toán reads. */
export type FuelRemoval = { kind: 'delete' } | { kind: 'deactivate'; reasons: string[] }

/** Each kind of usage in the order the refusal lists it, with how it names itself. */
const USAGE_REASONS: readonly [keyof FuelUsageCounts, (count: number) => string][] = [
  ['fuelMaps', vi.misaSettings.fuelUsage.fuelMaps],
  ['dispensers', vi.misaSettings.fuelUsage.dispensers],
  ['prices', vi.misaSettings.fuelUsage.prices],
  ['inventory', vi.misaSettings.fuelUsage.inventory],
  ['movements', vi.misaSettings.fuelUsage.movements],
  ['openingBalances', vi.misaSettings.fuelUsage.openingBalances],
  ['imports', vi.misaSettings.fuelUsage.imports],
  ['tankDips', vi.misaSettings.fuelUsage.tankDips],
  ['debtVisits', vi.misaSettings.fuelUsage.debtVisits],
]

/**
 * What pressing Xoá on a nhiên liệu does. Used by nothing, the row is deleted: it was
 * added this morning by mistake and no history points at it. Used by anything at all,
 * deletion is refused — a past ca, phiếu nhập or công nợ renders its tên by reading
 * this very row, and deleting it would leave those rows showing a bare khóa. The
 * refusal carries what is holding it so kế toán can see why, and Ngừng sử dụng is what
 * they get instead: the nhiên liệu leaves every ô chọn and no other row moves.
 */
export function decideFuelRemoval(counts: FuelUsageCounts): FuelRemoval {
  const reasons = USAGE_REASONS.filter(([kind]) => counts[kind] > 0).map(([kind, reason]) =>
    reason(counts[kind])
  )
  return reasons.length === 0 ? { kind: 'delete' } : { kind: 'deactivate', reasons }
}
