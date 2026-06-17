import * as XLSX from 'xlsx'

// ⚠️ PLACEHOLDER LAYOUT — the real "MISA Nội bộ" import template has NOT been
// provided yet (build plan §13.1, a blocker). The columns and sheet name below
// are a reasonable guess so the export pipeline is wired end-to-end. Replace
// MISA_COLUMNS + the row mapping with the exact template once received.

export type MisaRow = {
  date: string // dd/MM/yyyy
  stationCode: string
  dispenserCode: string
  fuelType: string
  openingReading: string
  closingReading: string
  liters: number
  unitPrice: number
  amount: number
}

const MISA_COLUMNS = [
  { header: 'Ngày' },
  { header: 'Mã trạm' },
  { header: 'Trụ' },
  { header: 'Nhiên liệu' },
  { header: 'Số đầu' },
  { header: 'Số cuối' },
  { header: 'Số lít' },
  { header: 'Đơn giá' },
  { header: 'Thành tiền' },
]

export function buildMisaWorkbook(rows: MisaRow[]): XLSX.WorkBook {
  const header = MISA_COLUMNS.map((c) => c.header)
  const data = rows.map((r) => [
    r.date,
    r.stationCode,
    r.dispenserCode,
    r.fuelType,
    r.openingReading,
    r.closingReading,
    r.liters,
    r.unitPrice,
    r.amount,
  ])
  const worksheet = XLSX.utils.aoa_to_sheet([header, ...data])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'BanLe')
  return workbook
}

export function workbookToBuffer(workbook: XLSX.WorkBook): Buffer {
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
