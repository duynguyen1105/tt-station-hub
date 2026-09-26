import ExcelJS from 'exceljs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import {
  type CashVoucherEntry,
  type CashVoucherKind,
  MISA_CASH_VOUCHER_COLUMNS,
  buildCashVoucherMatrix,
  cashVoucherCounts,
} from '@/lib/misa-export/build-cash-vouchers'
import { cashVoucherToXlsxBuffer } from '@/lib/misa-export/shift-to-excel'

const TEMPLATE: Record<CashVoucherKind, string> = {
  receipt: 'Phieu_thu_template.xls',
  payment: 'Phieu_chi_template.xls',
}

/** The template's rows as arrays, blanks as null, trimmed to the header's width. */
function templateRows(kind: CashVoucherKind): (string | number | null)[][] {
  const path = fileURLToPath(new URL(`../lib/misa-export/${TEMPLATE[kind]}`, import.meta.url))
  const wb = XLSX.read(readFileSync(path), { type: 'buffer' })
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets[wb.SheetNames[0]!]!, {
    header: 1,
    defval: null,
    raw: true,
  })
  const width = MISA_CASH_VOUCHER_COLUMNS[kind].length
  return rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? null))
}

const day = new Date('2026-09-25')
const input = (entries: CashVoucherEntry[]) => ({
  entries,
  postingDate: day,
  voucherDate: day,
  cashAccount: '11111',
})

describe('buildCashVoucherMatrix', () => {
  it.each(['receipt', 'payment'] as const)(
    'writes the %s header exactly as the MISA template',
    (kind) => {
      expect(buildCashVoucherMatrix(kind, input([]))[0]).toEqual(templateRows(kind)[0])
    }
  )

  it('reproduces the sample line of the Phiếu chi template from a Chi row', () => {
    const [, line] = buildCashVoucherMatrix(
      'payment',
      input([{ content: 'Phí chuyển tiền', receipt: null, payment: 30000 }])
    )
    // The owner's sample: dates, Diễn giải lý do chi = Diễn giải, TK Có 11111, Số tiền —
    // and nothing else, every other column left for the kế toán.
    expect(line).toEqual(templateRows('payment')[1])
  })

  it('puts a Thu on the Phiếu thu with tiền mặt on the Nợ side and the rest blank', () => {
    const [, line] = buildCashVoucherMatrix(
      'receipt',
      input([{ content: 'Anh Ba trả nợ', receipt: 500000, payment: null }])
    )
    const expected: (string | number | null)[] = MISA_CASH_VOUCHER_COLUMNS.receipt.map(() => null)
    expected[1] = '25/09/2026' // Ngày hạch toán
    expected[2] = '25/09/2026' // Ngày chứng từ
    expected[8] = 'Anh Ba trả nợ' // Diễn giải lý do nộp
    expected[12] = 'Anh Ba trả nợ' // Diễn giải (= I)
    expected[13] = '11111' // TK Nợ
    expected[15] = 500000 // Số tiền
    expect(line).toEqual(expected)
  })

  it('splits the table by side, keeps its order, and skips rows with nothing on that side', () => {
    const entries: CashVoucherEntry[] = [
      { content: 'Thu 1', receipt: 100, payment: null },
      { content: 'Chi 1', receipt: null, payment: 200 },
      { content: 'Cả hai', receipt: 300, payment: 400 },
      { content: 'Trống', receipt: 0, payment: null },
    ]
    const receipts = buildCashVoucherMatrix('receipt', input(entries)).slice(1)
    const payments = buildCashVoucherMatrix('payment', input(entries)).slice(1)
    expect(receipts.map((r) => [r[8], r[15]])).toEqual([
      ['Thu 1', 100],
      ['Cả hai', 300],
    ])
    expect(payments.map((r) => [r[10], r[15]])).toEqual([
      ['Chi 1', 200],
      ['Cả hai', 400],
    ])
    expect(cashVoucherCounts(entries)).toEqual({ receipt: 2, payment: 2 })
  })

  it('stamps the dates the kế toán chose rather than the ca ngày', () => {
    const [, line] = buildCashVoucherMatrix('receipt', {
      ...input([{ content: 'x', receipt: 1, payment: null }]),
      postingDate: new Date('2026-09-30'),
      voucherDate: new Date('2026-09-28'),
    })
    expect([line![1], line![2]]).toEqual(['30/09/2026', '28/09/2026'])
  })
})

describe('cashVoucherToXlsxBuffer', () => {
  it.each([
    ['receipt', 'Phiếu thu', 'FFCCCCFF', 'FFFFFF00'],
    ['payment', 'Phiếu chi', 'FFCCFFFF', 'FFCCFFFF'],
  ] as const)(
    'writes the %s as the one sheet MISA imports, coloured like its template',
    async (kind, sheet, first, diengiai) => {
      const matrix = buildCashVoucherMatrix(kind, input([{ content: 'x', receipt: 5, payment: 5 }]))
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load((await cashVoucherToXlsxBuffer(kind, matrix)) as unknown as ArrayBuffer)
      const ws = wb.worksheets[0]!
      expect(wb.worksheets.map((w) => w.name)).toEqual([sheet])
      expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual([
        ...MISA_CASH_VOUCHER_COLUMNS[kind],
      ])
      expect(ws.getRow(2).getCell(16).value).toBe(5)
      const fill = (col: number) =>
        (ws.getRow(1).getCell(col).fill as ExcelJS.FillPattern).fgColor?.argb
      expect(fill(1)).toBe(first)
      expect(fill(13)).toBe(diengiai) // 'Diễn giải'
    }
  )
})
