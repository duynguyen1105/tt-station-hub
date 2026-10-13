import { badRequest, unauthorized } from '@/lib/api/response'
import { getCurrentUser } from '@/lib/auth/session'
import {
  CASH_VOUCHER_SHEET,
  type CashVoucherKind,
  MISA_CASH_VOUCHER_COLUMNS,
  buildCashVoucherMatrix,
} from '@/lib/misa-export/build-cash-vouchers'
import { concatVoucherMatrices } from '@/lib/misa-export/build-range-export'
import { loadRangeShifts } from '@/lib/misa-export/load-range-shifts'
import { loadCashVoucherEntries } from '@/lib/misa-export/load-sales-inputs'
import { cashVoucherToXlsxBuffer } from '@/lib/misa-export/shift-to-excel'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

export const runtime = 'nodejs'

const KINDS: readonly CashVoucherKind[] = ['receipt', 'payment']
const FILE_PREFIX: Record<CashVoucherKind, string> = { receipt: 'phieu-thu', payment: 'phieu-chi' }

/**
 * Phiếu thu (`?kind=receipt`) or Phiếu chi (`?kind=payment`) of every ca Xuất MISA theo
 * khoảng covers (`&from&to&station=<id,id>`), ca after ca in the sales file's order, each
 * dated with its own ngày bán — the one-ca default of app/api/shifts/[id]/export-misa/cash.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const searchParams = new URL(req.url).searchParams
  const kind = searchParams.get('kind') as CashVoucherKind | null
  if (!kind || !KINDS.includes(kind)) return badRequest()

  const range = await loadRangeShifts(searchParams, user)
  if (range === null) return badRequest(vi.misaExport.rangeNeedsDates)
  const { shifts, fileStem } = range

  const [config, entries] = await Promise.all([
    prisma.misaGlobalConfig.findUnique({ where: { id: 'default' } }),
    loadCashVoucherEntries(shifts.map((s) => s.shift.id)),
  ])
  const matrix = concatVoucherMatrices(
    MISA_CASH_VOUCHER_COLUMNS[kind],
    shifts.map(({ shift }) =>
      buildCashVoucherMatrix(kind, {
        entries: entries.get(shift.id) ?? [],
        postingDate: shift.shiftDate,
        voucherDate: shift.shiftDate,
        // The template's own default: "mặc định 11111".
        cashAccount: config?.cashDebitAccount ?? '11111',
      })
    )
  )
  if (matrix.length === 1) {
    return badRequest(vi.misaExport.rangeNoCashRows(CASH_VOUCHER_SHEET[kind]))
  }

  const buffer = await cashVoucherToXlsxBuffer(kind, matrix)
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="misa-${FILE_PREFIX[kind]}-${fileStem}.xlsx"`,
    },
  })
}
