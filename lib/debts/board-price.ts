import { placeLitersDecimal } from '@/lib/ai/extract-visit'
import { type ExtractVisitResult } from '@/lib/ai/types'
import { type RetailPrice, priceRowOnDate } from '@/lib/misa-export/build-sales-voucher'

/**
 * The đơn giá a lượt bán nợ is charged at: the giá bán lẻ in force for its nhiên liệu on
 * the visit date, from the bảng giá of the trạm's vùng (/settings/misa/prices).
 *
 * Pure — prices in, a price out — so ingest, the Sửa số pre-fill and a trạm move all
 * read the same row. Null when the nhiên liệu is unknown or the bảng giá has no row yet.
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
 * Prices an AI pump read from the bảng giá instead of the ĐƠN GIÁ row it read.
 *
 * That row is the one most often glared or cut off, and a guessed price there both
 * charges the wrong amount and throws the liters decimal off (the decimal is placed by
 * reconciling TIỀN = LÍT × ĐƠN GIÁ). So the decimal is re-placed against the board
 * price, and the Khớp/Lệch check that follows says whether the pump agrees with it.
 */
export function priceMeterRead(
  meter: ExtractVisitResult,
  prices: RetailPrice[],
  fuelType: string | null,
  at: Date
): { unitPriceRead: number | null; meter: ExtractVisitResult; anomalies: string[] } {
  const unitPriceRead = boardPriceOf(prices, fuelType, at)
  return {
    unitPriceRead,
    meter: placeLitersDecimal({
      ...meter,
      unitPrice: unitPriceRead !== null ? String(unitPriceRead) : null,
    }),
    anomalies: unitPriceRead === null ? ['price_missing'] : [],
  }
}
