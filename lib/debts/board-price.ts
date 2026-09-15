import { type RetailPrice, priceRowOnDate } from '@/lib/misa-export/build-sales-voucher'

/**
 * The giá bán lẻ a lượt bán nợ's đơn giá is checked against: the price in force for its
 * nhiên liệu on the visit date, from the bảng giá of the trạm's vùng (/settings/misa/prices).
 *
 * The đơn giá itself is always the one read off the pump — the bảng giá only warns, and
 * the kế toán decides in Sửa số. Null when the nhiên liệu is unknown or has no price yet.
 */
export function boardPriceOf(
  prices: RetailPrice[],
  fuelType: string | null,
  at: Date
): number | null {
  if (fuelType === null) return null
  return priceRowOnDate(prices, fuelType, at)?.unitPrice ?? null
}

/**
 * Whether a read đơn giá disagrees with the bảng giá ("Đơn giá lệch bảng giá").
 *
 * Against the lượt xe's own nhiên liệu when the bảng giá prices it — a DO fill read at the
 * E0 price is still wrong. Without one, the read only has to be *some* nhiên liệu's price
 * on that date. Nothing to compare (no read, empty bảng giá) is not a mismatch.
 */
export function priceMismatchOf(
  prices: RetailPrice[],
  fuelType: string | null,
  at: Date,
  unitPrice: number | null
): boolean {
  if (unitPrice === null || prices.length === 0) return false
  const board = boardPriceOf(prices, fuelType, at)
  if (board !== null) return unitPrice !== board
  const fuels = new Set(prices.map((p) => p.fuelType))
  return ![...fuels].some((f) => priceRowOnDate(prices, f, at)?.unitPrice === unitPrice)
}
