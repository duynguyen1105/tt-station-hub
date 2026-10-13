import { NextResponse } from 'next/server'

import { badRequest, unauthorized } from '@/lib/api/response'
import { getCurrentUser } from '@/lib/auth/session'
import { cashVoucherCounts } from '@/lib/misa-export/build-cash-vouchers'
import { buildMisaRangeExport } from '@/lib/misa-export/build-range-export'
import { buildMisaSalesVoucher } from '@/lib/misa-export/build-sales-voucher'
import { loadRangeShifts } from '@/lib/misa-export/load-range-shifts'
import { loadCashVoucherEntries, loadMisaSalesInputs } from '@/lib/misa-export/load-sales-inputs'
import { misaRowsToXlsxBuffer } from '@/lib/misa-export/shift-to-excel'
import { vi } from '@/messages/vi'

export const runtime = 'nodejs'

/**
 * Xuất MISA theo kỳ — one Chứng từ bán hàng holding every chốt'd ca of the picked trạm
 * whose ngày bán lies in `?from&to` (`&station=<id,id>`, none → every trạm the viewer can
 * reach). Each ca is built exactly as its own Xuất MISA builds it, with the dates that
 * export defaults to: its ngày bán for Ngày hạch toán / Ngày chứng từ, the ngày on its bán
 * nợ photos for Ngày hóa đơn.
 *
 * Same gates as one ca's export, over the whole khoảng: `preflight=1` answers with the
 * summed litres and every ca with an error or a warning; any error is a 422 and no file, so
 * the file never comes up short of a ca's doanh thu; warnings need `confirm=1` (409 without).
 */
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const searchParams = new URL(req.url).searchParams
  const preflight = searchParams.get('preflight') === '1'
  const confirmed = searchParams.get('confirm') === '1'

  const range = await loadRangeShifts(searchParams, user)
  if (range === null) return badRequest(vi.misaExport.rangeNeedsDates)
  const { shifts, stations, fileStem } = range
  // The preflight answers an empty khoảng with 0 ca; only a file needs a ca to hold.
  if (shifts.length === 0 && !preflight) return badRequest(vi.misaExport.rangeEmpty)

  const shiftIds = shifts.map((s) => s.shift.id)
  const [inputs, cashEntries] = await Promise.all([
    loadMisaSalesInputs(
      shifts.map((s) => s.shift),
      stations
    ),
    preflight ? loadCashVoucherEntries(shiftIds) : null,
  ])
  const built = buildMisaRangeExport(
    shifts.flatMap(({ shift, stationCode }) => {
      const loaded = inputs.get(shift.id)
      if (!loaded) return []
      return {
        shiftId: shift.id,
        stationCode,
        shiftDate: shift.shiftDate,
        result: buildMisaSalesVoucher({
          ...loaded.input,
          invoiceDate: loaded.photoDate ?? undefined,
        }),
        cashCounts: cashVoucherCounts(cashEntries?.get(shift.id) ?? []),
      }
    })
  )

  if (preflight) {
    return NextResponse.json({
      shiftCount: built.shiftCount,
      fuelSummary: built.fuelSummary,
      problems: built.problems,
      cashVoucherCounts: built.cashVoucherCounts,
    })
  }

  if (built.problems.some((p) => p.errors.length > 0)) {
    return NextResponse.json({ problems: built.problems }, { status: 422 })
  }
  if (built.problems.length > 0 && !confirmed) {
    return NextResponse.json({ problems: built.problems }, { status: 409 })
  }

  const buffer = await misaRowsToXlsxBuffer(built.rows)
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="misa-${fileStem}.xlsx"`,
    },
  })
}
