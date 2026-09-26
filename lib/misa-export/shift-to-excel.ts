import ExcelJS from 'exceljs'

import {
  CASH_VOUCHER_SHEET,
  type CashVoucherKind,
  MISA_CASH_VOUCHER_COLUMNS,
} from './build-cash-vouchers'
import { MISA_SHEET_NAME, type MisaSalesRow, misaRowsToMatrix } from './build-sales-voucher'
import paymentNotes from './phieu_chi_notes.json'
import receiptNotes from './phieu_thu_notes.json'
import salesNotes from './template_notes.json'

// Thin .xlsx adapters over the pure builders: each serializes a builder's matrix into the one
// sheet MISA imports, styled to match the official template beside this file — the header fills,
// the column widths, and a per-column "MISA SME.NET" input note shown when a cell is selected.
// All business logic lives in build-sales-voucher.ts / build-cash-vouchers.ts.

// Header fills read verbatim from the templates (patternType solid, fgColor). ARGB.
const GREY = 'FFCCCCFF'
const YELLOW = 'FFFFFF00'
const CYAN = 'FFCCFFFF'

// Column widths (wch) read verbatim from each template, one per column.
const SALES_WIDTHS = [
  15.17, 21.17, 22.67, 22.67, 36.5, 22.67, 22.67, 18, 17.67, 20.67, 22.67, 22.67, 14.17, 17.67, 19,
  24.83, 22.67, 15.33, 28, 21.5, 22.67, 22.5, 23.33, 19.83, 23.67, 22.5, 12, 10.17, 19.83, 17.5,
  20.83, 13.67, 22.83, 13.67, 20.5, 13.5, 16, 13.5, 18.33, 34.83, 22.33, 19.5, 36.5, 18.83, 18.83,
  18.83, 18.83, 18.83, 23.33,
]
const RECEIPT_WIDTHS = [
  17.72, 17.72, 17.72, 20.58, 19.01, 24.86, 28.01, 22.72, 22.72, 22.72, 22.72, 21.44, 34.15, 19.58,
  16.58, 17.58, 25.44, 19.86,
]
const PAYMENT_WIDTHS = [
  17.72, 17.72, 17.72, 20.58, 19.01, 24.86, 28.01, 28.01, 28.01, 23.72, 22.72, 22.72, 34.15, 19.58,
  16.58, 17.58, 25.44, 19.86, 34.15, 15.15, 18.86, 14.29, 34.86, 24.15, 16.15, 16.01, 16.15, 16.15,
  22.29, 16.72, 17.01, 24.44,
]

type TemplateNote = { range: string; title: string; note: string }

type SheetSpec = {
  sheetName: string
  matrix: (string | number | null)[][]
  widths: number[]
  /** Header fill of a 0-based column. */
  headerFill: (col: number) => string
  /** 1-based column → Excel number format; values stay numeric so MISA still imports them. */
  numFmts: Record<number, string>
  notes: TemplateNote[]
}

const THIN_BORDER: ExcelJS.Borders = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
  diagonal: { style: undefined },
}

// `Worksheet.dataValidations` and an input-message-only validation (type 'any') both work at runtime
// but are absent from exceljs's public types, so we reach them through a narrow local shape.
type InputNote = {
  type: 'any'
  allowBlank: boolean
  showInputMessage: boolean
  promptTitle: string
  prompt: string
}
type DataValidations = { add(sqref: string, value: InputNote): void }

/**
 * SheetJS produces byte-identical output for identical input; exceljs stamps document dates, so we
 * pin the workbook metadata to keep re-exporting the same shift deterministic (identical file).
 */
async function misaSheetToXlsxBuffer(spec: SheetSpec): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'TT Station Hub'
  workbook.lastModifiedBy = 'TT Station Hub'
  workbook.created = new Date(0)
  workbook.modified = new Date(0)

  const worksheet = workbook.addWorksheet(spec.sheetName)
  worksheet.columns = spec.widths.map((width) => ({ width }))
  for (const row of spec.matrix) worksheet.addRow(row)
  for (const [col, numFmt] of Object.entries(spec.numFmts)) {
    worksheet.getColumn(Number(col)).numFmt = numFmt
  }

  const headerRow = worksheet.getRow(1)
  // No explicit height (and no wrapText) so the header row matches the data rows' default height.
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: spec.headerFill(colNumber - 1) },
    }
    cell.font = { bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = THIN_BORDER
  })

  const validations = (worksheet as unknown as { dataValidations: DataValidations }).dataValidations
  for (const note of spec.notes) {
    validations.add(note.range, {
      type: 'any',
      allowBlank: true,
      showInputMessage: true,
      promptTitle: note.title,
      prompt: note.note,
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

/** The sales voucher (Chứng từ bán hàng): grey A→U, yellow from 'Mã hàng (*)'. */
export async function misaRowsToXlsxBuffer(rows: MisaSalesRow[]): Promise<Buffer> {
  const YELLOW_FROM = 21 // 0-based index of 'Mã hàng (*)'
  return misaSheetToXlsxBuffer({
    sheetName: MISA_SHEET_NAME,
    matrix: misaRowsToMatrix(rows),
    widths: SALES_WIDTHS,
    headerFill: (col) => (col >= YELLOW_FROM ? YELLOW : GREY),
    // Vietnamese-locale number display (dot thousands, comma decimals). 1-based column =
    // build-sales-voucher COL index + 1: Số lượng 28, Đơn giá 30, Thành tiền 31.
    numFmts: { 28: '#,##0.00', 30: '#,##0', 31: '#,##0' },
    notes: salesNotes,
  })
}

/**
 * Phiếu thu (grey A→L, yellow from 'Diễn giải') or Phiếu chi (light cyan throughout), as their
 * templates colour them. Số tiền (column 16) displays as whole đồng.
 */
export async function cashVoucherToXlsxBuffer(
  kind: CashVoucherKind,
  matrix: (string | number | null)[][]
): Promise<Buffer> {
  const receipt = kind === 'receipt'
  const RECEIPT_YELLOW_FROM = MISA_CASH_VOUCHER_COLUMNS.receipt.indexOf('Diễn giải')
  return misaSheetToXlsxBuffer({
    sheetName: CASH_VOUCHER_SHEET[kind],
    matrix,
    widths: receipt ? RECEIPT_WIDTHS : PAYMENT_WIDTHS,
    headerFill: (col) => (!receipt ? CYAN : col >= RECEIPT_YELLOW_FROM ? YELLOW : GREY),
    numFmts: { 16: '#,##0' },
    notes: receipt ? receiptNotes : paymentNotes,
  })
}
