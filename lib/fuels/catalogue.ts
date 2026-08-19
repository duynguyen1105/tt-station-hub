// Every rule the danh mục nhiên liệu adds. Pure — plain values in, plain values
// out — so the rules are testable without React or Prisma, in the style of
// retail-price-board.ts and photo-to-reading.ts.
//
// The refusal to xoá is written here rather than in the route, so the Vietnamese it
// speaks is a fact of the rule and not of the screen that shows it.
import { formatLiters } from '@/lib/format'
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
 *
 * It has a second job: `resolvePlateFuel` runs it over both sides of a comparison to
 * ask whether two strings name the same thing, which is what makes a plate word match a
 * mã hàng, a tên or a khóa without caring about case, diacritics or spacing.
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
 * The nhiên liệu a fuel picker inside a trạm may offer: what the trạm declared it sells
 * — its Map nhiên liệu rows — minus what Trường Thịnh has stopped selling. The kho
 * movement form, the phiếu nhập form and the công nợ picker all narrow here, so a kế
 * toán cannot book a lít against a nhiên liệu their trạm has no hầm, no trụ and no mã
 * hàng for.
 *
 * The mirror of `addableFuels`: that one offers what the trạm has yet to take on, this
 * one what it already has. A mapped khóa the danh mục no longer holds names no nhiên
 * liệu and so is offered by neither.
 *
 * Narrowing is about what may be chosen now, never about what may be read: a row
 * already carrying a nhiên liệu the trạm has since stopped selling still reads its tên
 * through `fuelTypeLabelFrom`, which does not filter.
 */
export function stationFuels(
  catalogue: readonly CatalogueFuel[],
  mapped: readonly string[]
): CatalogueFuel[] {
  return selectableFuels(catalogue).filter((fuel) => mapped.includes(fuel.fuelType))
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

/**
 * One trụ of a trạm, as the removal guard reads it: what it is called, and whether it
 * is still pumping.
 */
export type StationDispenser = { displayName: string; isActive: boolean }

/**
 * What one trạm still has for one nhiên liệu at the moment kế toán asks to stop selling
 * it: its trụ for that nhiên liệu, active or not, and the lít its tồn kho says are in
 * the hầm. Nothing historical is in here — a past ca, phiếu nhập or công nợ never
 * blocks a removal.
 */
export type StationFuelUsage = {
  dispensers: readonly StationDispenser[]
  stock: number
}

/** Remove the row, or refuse and say what is still in the way. */
export type StationFuelRemoval = { kind: 'remove' } | { kind: 'blocked'; reasons: string[] }

/**
 * Whether a trạm may stop selling a nhiên liệu — that is, whether its Map nhiên liệu
 * row may go, because the row is the declaration.
 *
 * Two things block it, and both are things kế toán can clear: an **active trụ** pumping
 * the nhiên liệu (ngừng the trụ), and a **tồn kho** that is not zero (run the stock
 * down). Each names itself with what it is — the trụ by tên, the tồn kho by số lít — so
 * the refusal says what to go and fix rather than only that something is wrong.
 *
 * An inactive trụ pumps nothing and does not block: keeping its row is how a trạm
 * remembers a trụ it retired. A tồn kho âm blocks like a positive one — it is drift
 * that has to be settled before the nhiên liệu leaves the trạm.
 *
 * What this deliberately does not weigh is history. Ca, phiếu nhập, đo hầm and công nợ
 * store the khóa and read their tên back through the danh mục, which a removal never
 * touches — so they survive it intact. The one accepted loss is re-exporting an old ca:
 * without the row there is no mã hàng, and that export fails.
 */
export function decideStationFuelRemoval(usage: StationFuelUsage): StationFuelRemoval {
  const pumping = usage.dispensers.filter((dispenser) => dispenser.isActive)
  const reasons = [
    ...(pumping.length > 0
      ? [
          vi.misaSettings.stationFuelUsage.dispensers(
            pumping.map((dispenser) => dispenser.displayName).join(', ')
          ),
        ]
      : []),
    ...(usage.stock !== 0
      ? [vi.misaSettings.stationFuelUsage.stock(formatLiters(usage.stock))]
      : []),
  ]
  return reasons.length === 0 ? { kind: 'remove' } : { kind: 'blocked', reasons }
}

/**
 * One row of a trạm's Map nhiên liệu, as the plate resolver reads it: the khóa it
 * stores and the mã hàng MISA knows that nhiên liệu by at this trạm.
 */
export type StationFuelMapping = { fuelType: string; productCode: string }

/**
 * A fuel word read out of a document, resolved to a khóa — `resolvePlateFuel` with its
 * danh mục and its trạm already bound. A module that reads a fuel word off a barem
 * sheet or a biên bản takes one of these rather than a danh mục, so it stays pure and
 * there is one rule behind every fuel word in the app rather than one per document.
 */
export type FuelWordResolver = (word: string) => string | null

/**
 * The resolver for one trạm — `resolvePlateFuel` with its danh mục and that trạm's mã
 * hàng bound in. The two lists always travel together and only ever go to the one
 * function, so they are tied off here rather than threaded through every module that
 * reads a fuel word off a document.
 */
export function fuelWordResolver(
  catalogue: readonly CatalogueFuel[],
  mappings: readonly StationFuelMapping[]
): FuelWordResolver {
  return (word) => resolvePlateFuel(catalogue, mappings, word)
}

/**
 * What a fuel word printed on a trụ or hầm plate means at one trạm. The vision prompt
 * no longer carries a list of codes — it copies the word as printed — so this is the
 * one place that turns "DO01" into a khóa, and it needs a trạm to do it.
 *
 * It must be called with the trạm the photo is FINALLY assigned to, not the one it
 * arrived from: a plate can name a different trạm than the sender does, and the app
 * honours that override. Resolving before the trạm is settled reads the wrong trạm's
 * mã hàng.
 *
 * Two steps, and the order is the plate rollout: Trường Thịnh is having plates printed
 * with the mã hàng, so that is asked first; failing that the danh mục's tên and khóa
 * answer, which is what keeps a trụ still painted "DC" readable on the same day as one
 * repainted "DO01". Both are correct at once.
 *
 * Comparison is by the khóa each side would generate, so case, diacritics and
 * surrounding whitespace fall away on both sides at once.
 *
 * A nhiên liệu đã ngừng never resolves, by either step — a photo cannot bring back
 * something Trường Thịnh stopped selling. Neither does a word nothing answers for: the
 * result is null, the field stays empty, and kế toán sets it in review. Never guess. A
 * wrong nhiên liệu that looks confident is worse than an empty one that waits.
 */
export function resolvePlateFuel(
  catalogue: readonly CatalogueFuel[],
  mappings: readonly StationFuelMapping[],
  word: string | null | undefined
): string | null {
  const key = word ? generateFuelType(word) : ''
  if (key === '') return null

  const selectable = selectableFuels(catalogue)
  const byMaHang = mappings.find((row) => generateFuelType(row.productCode) === key)
  if (byMaHang && selectable.some((fuel) => fuel.fuelType === byMaHang.fuelType)) {
    return byMaHang.fuelType
  }

  const byCatalogue = selectable.find(
    (fuel) => generateFuelType(fuel.fuelType) === key || generateFuelType(fuel.name) === key
  )
  return byCatalogue?.fuelType ?? null
}
