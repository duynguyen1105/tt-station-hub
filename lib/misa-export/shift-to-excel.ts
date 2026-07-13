import ExcelJS from 'exceljs'

import { MISA_SHEET_NAME, type MisaSalesRow, misaRowsToMatrix } from './build-sales-voucher'
import notes from './template_notes.json'

// Thin .xlsx adapter over the pure builder: serializes the builder's 49-column rows into the single
// `Chứng từ bán hàng` sheet MISA imports, and styles it to match the official template
// (lib/misa-export/Ban_hang_template.xls): a two-colour header + a per-column "MISA SME.NET" input
// note shown when a cell is selected. All business logic lives in build-sales-voucher.ts.

// Header fills read verbatim from the template (patternType solid, fgColor): columns A→U
// ('Hiển thị trên sổ' … 'NV bán hàng') are grey-lavender, V→AW ('Mã hàng (*)' …) are yellow. ARGB.
const GREY = 'FFCCCCFF'
const YELLOW = 'FFFFFF00'
const YELLOW_FROM = 21 // 0-based index of 'Mã hàng (*)' — first yellow column

// Column widths (wch) read verbatim from the template, one per 49 columns.
const COL_WIDTHS = [
  15.17, 21.17, 22.67, 22.67, 36.5, 22.67, 22.67, 18, 17.67, 20.67, 22.67, 22.67, 14.17, 17.67, 19,
  24.83, 22.67, 15.33, 28, 21.5, 22.67, 22.5, 23.33, 19.83, 23.67, 22.5, 12, 10.17, 19.83, 17.5,
  20.83, 13.67, 22.83, 13.67, 20.5, 13.5, 16, 13.5, 18.33, 34.83, 22.33, 19.5, 36.5, 18.83, 18.83,
  18.83, 18.83, 18.83, 23.33,
]

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
export async function misaRowsToXlsxBuffer(rows: MisaSalesRow[]): Promise<Buffer> {
  const matrix = misaRowsToMatrix(rows) // [header, ...body], 49 columns wide

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'TT Station Hub'
  workbook.lastModifiedBy = 'TT Station Hub'
  workbook.created = new Date(0)
  workbook.modified = new Date(0)

  const worksheet = workbook.addWorksheet(MISA_SHEET_NAME)
  worksheet.columns = COL_WIDTHS.map((width) => ({ width }))
  for (const row of matrix) worksheet.addRow(row)

  const headerRow = worksheet.getRow(1)
  // No explicit height (and no wrapText) so the header row matches the data rows' default height.
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const argb = colNumber - 1 >= YELLOW_FROM ? YELLOW : GREY
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
    cell.font = { bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = THIN_BORDER
  })

  // Per-column input note ("MISA SME.NET" prompt shown on cell selection), from the template notes.
  const validations = (worksheet as unknown as { dataValidations: DataValidations }).dataValidations
  for (const note of notes) {
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
