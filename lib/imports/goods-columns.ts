// The head of the biên bản chuẩn: the goods table's columns, and the one seal
// the whole sheet records.
//
// The standard form pre-prints four goods columns — E0, EA, DO, DC — whether or
// not a delivery fills them, so the review form shows four whatever the AI read.
// A column is offered, never demanded: EA is empty on every biên bản so far
// (no Trạm stocks E5 yet), and an empty one of the app's own headings is saved
// as no product at all.
//
// Old station-specific sheets printed their own columns ("RON 95", "DO 0.05S")
// and a seal cell per column. Those are not a lost cause: their columns are
// shown after the four and kept whatever they carry, and their seals collapse
// into the single field, so a drawer of old paper still reviews.
//
// Pure: no database, no side effects, and the extraction is left as the AI
// returned it.
import { type ReceiptProduct } from './bien-ban'

/** The goods columns the biên bản chuẩn prints, in printed order. */
export const STANDARD_GOODS_COLUMNS = ['E0', 'EA', 'DO', 'DC'] as const

/**
 * One goods column as the review form holds it. Every cell is a string, as the
 * paper is, until confirming parses them — and the seal is gone from here: the
 * standard form records one for the whole biên bản.
 */
export type GoodsColumn = {
  productLabel: string
  warehouse: string
  quantityLiters: string
  exportSlipNo: string
}

/**
 * The columns section "Hàng nhập" shows: the four standard ones in printed
 * order, filled from the extraction where it read them, followed by every
 * column the paper carried that is none of the four.
 *
 * A header binds to a standard column only when it *is* that column — "DO"
 * binds, "DO 0.05S" is an old sheet's own column and keeps its own place. The
 * header is shown exactly as the paper printed it; matching it is not the same
 * as retyping it.
 */
export function goodsColumns(extracted: readonly ReceiptProduct[]): GoodsColumn[] {
  const unclaimed = [...extracted]
  const standard = STANDARD_GOODS_COLUMNS.map((code) => {
    const index = unclaimed.findIndex((p) => p.productLabel.trim().toUpperCase() === code)
    // A second column of the same fuel does not overwrite the first; it is one
    // more thing the paper said, and lands among the extra columns below.
    const found = index >= 0 ? unclaimed.splice(index, 1)[0] : undefined
    return found ? column(found) : emptyGoodsColumn(code)
  })
  return [...standard, ...unclaimed.map(column)]
}

/** A blank column for a goods column the standard form does not print and the
 *  reviewer is adding by hand. */
export function emptyGoodsColumn(productLabel = ''): GoodsColumn {
  return { productLabel, warehouse: '', quantityLiters: '', exportSlipNo: '' }
}

/**
 * Whether a reviewed column belongs in the saved biên bản, or is just a heading
 * the app printed. One of the four standard columns with nothing under it — EA
 * on every sheet so far — is saved as no product at all, so nothing is booked
 * and no Hầm is offered a comparison against it. Every other column is the
 * paper's own and is kept whatever it carries: the app printed four headings
 * and may drop its own, but what a reviewer read off the sheet is theirs.
 */
export function goodsColumnRecorded(col: GoodsColumn): boolean {
  const label = col.productLabel.trim()
  if (label === '') return false
  if (!isStandardColumn(label)) return true
  return [col.warehouse, col.quantityLiters, col.exportSlipNo].some((cell) => cell.trim() !== '')
}

/**
 * The seal the review form shows: the standard form's merged "Số niêm chì" cell
 * when the sheet has one, and otherwise the seals an old sheet printed per
 * column, joined — a value nobody can see is a value nobody can correct.
 */
export function bienBanSeal(extraction: {
  sealNo: string | null
  products: readonly ReceiptProduct[]
}): string {
  if (extraction.sealNo !== null && extraction.sealNo.trim() !== '') return extraction.sealNo
  const perColumn = extraction.products
    .map((p) => p.sealNo?.trim() ?? '')
    .filter((seal) => seal !== '')
  return [...new Set(perColumn)].join(', ')
}

function isStandardColumn(label: string): boolean {
  return STANDARD_GOODS_COLUMNS.some((code) => code === label.toUpperCase())
}

function column(product: ReceiptProduct): GoodsColumn {
  return {
    productLabel: product.productLabel,
    warehouse: cell(product.warehouse),
    quantityLiters: cell(product.quantityLiters),
    exportSlipNo: cell(product.exportSlipNo),
  }
}

function cell(value: string | number | null): string {
  return value === null ? '' : String(value)
}
