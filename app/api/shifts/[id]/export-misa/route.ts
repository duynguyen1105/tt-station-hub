import { NextResponse } from 'next/server'

import { forbidden, notFound, unauthorized } from '@/lib/api/response'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { cashVoucherCounts } from '@/lib/misa-export/build-cash-vouchers'
import { buildMisaSalesVoucher } from '@/lib/misa-export/build-sales-voucher'
import { loadCashVoucherEntries, loadMisaSalesInputs } from '@/lib/misa-export/load-sales-inputs'
import { misaRowsToXlsxBuffer } from '@/lib/misa-export/shift-to-excel'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params
  const searchParams = new URL(req.url).searchParams
  const preflight = searchParams.get('preflight') === '1'
  const confirmed = searchParams.get('confirm') === '1'
  // Accountant-set voucher dates (yyyy-MM-dd) for H/I/N; undefined → the sale date, except
  // Ngày hóa đơn, which defaults to the ngày on the ca's bán nợ photos (photoInvoiceDate).
  const parseDate = (s: string | null): Date | undefined => {
    if (!s) return undefined
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? undefined : d
  }
  const postingDate = parseDate(searchParams.get('postingDate'))
  const voucherDate = parseDate(searchParams.get('voucherDate'))
  const invoiceDate = parseDate(searchParams.get('invoiceDate'))

  const shift = await prisma.shift.findUnique({ where: { id } })
  if (!shift) return notFound()

  const { stationId, shiftDate } = shift

  // Prices are keyed by the station's fuel area (retail zone), so resolve the station first.
  const station = await prisma.station.findUnique({ where: { id: stationId } })
  if (!station) return notFound()
  // The ca's own trạm decides — for the preflight as much as for the file, since
  // the preflight already answers with another trạm's figures.
  if (!(await canReachStation(user, station.id))) return forbidden()

  const loaded = (await loadMisaSalesInputs([shift], [station])).get(id)
  if (!loaded) return notFound()
  const { input, photoDate } = loaded

  const result = buildMisaSalesVoucher({
    ...input,
    postingDate,
    voucherDate,
    invoiceDate: invoiceDate ?? photoDate ?? undefined,
  })

  // Preflight mode → per-fuel math + fix-list + warnings as JSON, no file generated. It also
  // says how many Phiếu thu / Phiếu chi lines the ca's Thu chi table holds, so the dialog can
  // offer those two files (app/api/shifts/[id]/export-misa/cash) only when they have lines,
  // and the photo ngày the dialog pre-fills Ngày hóa đơn with (yyyy-MM-dd, null → none).
  if (preflight) {
    const cashEntries = (await loadCashVoucherEntries([id])).get(id) ?? []
    return NextResponse.json({
      stationId,
      fuelSummary: result.fuelSummary,
      invoiceDate: photoDate ? photoDate.toISOString().slice(0, 10) : null,
      errors: result.errors,
      warnings: result.warnings,
      cashVoucherCounts: cashVoucherCounts(cashEntries),
    })
  }

  // Blocking preflight errors → JSON fix-list, not a bad file.
  if (result.errors.length > 0) {
    return NextResponse.json({ errors: result.errors, warnings: result.warnings }, { status: 422 })
  }

  // Negative-cash (and any other) warnings require an explicit confirm; the direct
  // download link can't bypass it. 409 = blocked pending confirm.
  if (result.warnings.length > 0 && !confirmed) {
    return NextResponse.json({ errors: [], warnings: result.warnings }, { status: 409 })
  }

  const buffer = await misaRowsToXlsxBuffer(result.rows)
  const dateStr = shiftDate.toISOString().slice(0, 10)
  const filename = `misa-${station?.code ?? stationId}-${dateStr}.xlsx`
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
