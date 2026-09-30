// Pure builder for the two MISA cash vouchers a ca's Thu chi tiền mặt – Khách CK table
// feeds: Phiếu thu (one line per Thu) and Phiếu chi (one line per Chi). Headers are read
// verbatim from the MISA import templates beside this file (Phieu_thu_template.xls,
// Phieu_chi_template.xls). The software fills only what the owner's notes on those
// templates mark "Phần mềm": the two dates, the Nội dung (as Diễn giải lý do and again as
// Diễn giải), the tiền mặt account and Số tiền. Every other column — Số chứng từ, đối
// tượng, the counter account — is left blank for the kế toán to fill in MISA.
import { formatDate } from './build-sales-voucher'

export type CashVoucherKind = 'receipt' | 'payment'

export const CASH_VOUCHER_SHEET: Record<CashVoucherKind, string> = {
  receipt: 'Phiếu thu',
  payment: 'Phiếu chi',
}

export const MISA_CASH_VOUCHER_COLUMNS: Record<CashVoucherKind, readonly string[]> = {
  receipt: [
    'Hiển thị trên sổ',
    'Ngày hạch toán (*)',
    'Ngày chứng từ (*)',
    'Số chứng từ (*)',
    'Mã đối tượng',
    'Tên đối tượng',
    'Địa chỉ',
    'Lý do nộp',
    'Diễn giải lý do nộp',
    'Người nộp',
    'Nhân viên thu',
    'Kèm theo',
    'Diễn giải',
    'TK Nợ (*)',
    'TK Có (*)',
    'Số tiền',
    'Đối tượng',
    'TK ngân hàng',
  ],
  payment: [
    'Hiển thị trên sổ',
    'Ngày hạch toán (*)',
    'Ngày chứng từ (*)',
    'Số chứng từ (*)',
    'Mã đối tượng',
    'Tên đối tượng',
    'Địa chỉ',
    'Nhân viên',
    'Kèm theo',
    'Lý do chi',
    'Diễn giải lý do chi',
    'Người nhận',
    'Diễn giải',
    'TK Nợ (*)',
    'TK Có (*)',
    'Số tiền',
    'Đối tượng',
    'TK ngân hàng',
    'Diễn giải (Thuế)',
    'TK thuế GTGT',
    'Tiền thuế GTGT',
    '% thuế GTGT',
    'Tỷ lệ tính thuế (Thuế suất KHAC)',
    'Giá trị HHDV chưa thuế',
    'Ngày hóa đơn',
    'Số hóa đơn',
    'Mẫu số hóa đơn',
    'Ký hiệu hóa đơn',
    'Nhóm HHDV mua vào',
    'Mã nhà cung cấp',
    'Tên nhà cung cấp',
    'Mã số thuế nhà cung cấp',
  ],
}

// 0-based columns the software fills, per voucher. The tiền mặt account is the debit side
// of a Phiếu thu (money comes into the quỹ) and the credit side of a Phiếu chi.
const COL: Record<
  CashVoucherKind,
  {
    postingDate: number
    voucherDate: number
    reason: number
    description: number
    cashAccount: number
    amount: number
  }
> = {
  receipt: {
    postingDate: 1,
    voucherDate: 2,
    reason: 8,
    description: 12,
    cashAccount: 13,
    amount: 15,
  },
  payment: {
    postingDate: 1,
    voucherDate: 2,
    reason: 10,
    description: 12,
    cashAccount: 14,
    amount: 15,
  },
}

/**
 * One row of the ca's Thu chi table, as stored: Nội dung and whole-đồng Thu / Chi /
 * Chuyển khoản. Trường Thịnh books a Chuyển khoản on the Phiếu chi like a Chi (anh Nam,
 * 30/09), whether it paid for the ca's fuel or an older nợ.
 */
export type CashVoucherEntry = {
  content: string
  receipt: number | null
  payment: number | null
  transfer: number | null
}

export type CashVoucherInput = {
  entries: CashVoucherEntry[]
  postingDate: Date
  voucherDate: Date
  /** TK tiền mặt — MisaGlobalConfig.cashDebitAccount, "mặc định 11111". */
  cashAccount: string
}

/**
 * The amounts a row puts on this voucher, in column order: its Thu on a phiếu thu; its
 * Chi and then its Chuyển khoản on a phiếu chi, one line each.
 */
function amountsOf(entry: CashVoucherEntry, kind: CashVoucherKind): number[] {
  const cells = kind === 'receipt' ? [entry.receipt] : [entry.payment, entry.transfer]
  return cells.filter((amount): amount is number => amount !== null && amount > 0)
}

/** How many lines each voucher would hold — what the export dialog shows beside its buttons. */
export function cashVoucherCounts(entries: CashVoucherEntry[]): Record<CashVoucherKind, number> {
  return {
    receipt: entries.reduce((n, e) => n + amountsOf(e, 'receipt').length, 0),
    payment: entries.reduce((n, e) => n + amountsOf(e, 'payment').length, 0),
  }
}

/**
 * The voucher as a matrix, header first: one line per Thu (phiếu thu) or per Chi and
 * Chuyển khoản (phiếu chi), in the table's own order. A row holding several lands on each.
 */
export function buildCashVoucherMatrix(
  kind: CashVoucherKind,
  input: CashVoucherInput
): (string | number | null)[][] {
  const header = MISA_CASH_VOUCHER_COLUMNS[kind]
  const col = COL[kind]
  const posting = formatDate(input.postingDate)
  const voucher = formatDate(input.voucherDate)
  const body = input.entries.flatMap((entry) =>
    amountsOf(entry, kind).map((amount) => {
      const row: (string | number | null)[] = header.map(() => null)
      const content = entry.content.trim() || null
      row[col.postingDate] = posting
      row[col.voucherDate] = voucher
      row[col.reason] = content
      row[col.description] = content
      row[col.cashAccount] = input.cashAccount
      row[col.amount] = amount
      return row
    })
  )
  return [[...header], ...body]
}
