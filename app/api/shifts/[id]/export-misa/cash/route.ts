import { badRequest, forbidden, notFound, unauthorized } from '@/lib/api/response'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import {
  CASH_VOUCHER_SHEET,
  type CashVoucherKind,
  buildCashVoucherMatrix,
} from '@/lib/misa-export/build-cash-vouchers'
import { cashVoucherToXlsxBuffer } from '@/lib/misa-export/shift-to-excel'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

export const runtime = 'nodejs'

const KINDS: readonly CashVoucherKind[] = ['receipt', 'payment']
const FILE_PREFIX: Record<CashVoucherKind, string> = { receipt: 'phieu-thu', payment: 'phieu-chi' }

/**
 * Phiếu thu (`?kind=receipt`) or Phiếu chi (`?kind=payment`) of one ca, built from its Thu chi
 * tiền mặt – Khách CK table, with the same Ngày hạch toán / Ngày chứng từ the Xuất MISA dialog
 * sends for the sales voucher (default: the ca's ngày). Same access rule as that export.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params
  const searchParams = new URL(req.url).searchParams
  const kind = searchParams.get('kind') as CashVoucherKind | null
  if (!kind || !KINDS.includes(kind)) return badRequest()
  const parseDate = (s: string | null): Date | undefined => {
    if (!s) return undefined
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? undefined : d
  }

  const shift = await prisma.shift.findUnique({ where: { id } })
  if (!shift) return notFound()
  const station = await prisma.station.findUnique({ where: { id: shift.stationId } })
  if (!station) return notFound()
  if (!(await canReachStation(user, station.id))) return forbidden()

  const [config, entries] = await Promise.all([
    prisma.misaGlobalConfig.findUnique({ where: { id: 'default' } }),
    prisma.shiftCashEntry.findMany({ where: { shiftId: id }, orderBy: { position: 'asc' } }),
  ])
  const matrix = buildCashVoucherMatrix(kind, {
    entries: entries.map((e) => ({
      content: e.content,
      receipt: e.receipt === null ? null : e.receipt.toNumber(),
      payment: e.payment === null ? null : e.payment.toNumber(),
    })),
    postingDate: parseDate(searchParams.get('postingDate')) ?? shift.shiftDate,
    voucherDate: parseDate(searchParams.get('voucherDate')) ?? shift.shiftDate,
    // The template's own default: "mặc định 11111".
    cashAccount: config?.cashDebitAccount ?? '11111',
  })
  if (matrix.length === 1) return badRequest(vi.misaExport.noCashRows(CASH_VOUCHER_SHEET[kind]))

  const buffer = await cashVoucherToXlsxBuffer(kind, matrix)
  const filename = `misa-${FILE_PREFIX[kind]}-${station.code}-${shift.shiftDate.toISOString().slice(0, 10)}.xlsx`
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
