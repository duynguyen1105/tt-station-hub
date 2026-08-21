import ExcelJS from 'exceljs'

import { type NextRequest } from 'next/server'

import { forbidden, unauthorized } from '@/lib/api/response'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation, reachableStationIds } from '@/lib/auth/station-guard'
import { fuelTypeLabeller } from '@/lib/fuels/load-catalogue'
import { loadImportFilterOptions } from '@/lib/inventory/import-filter-options'
import { importSelection } from '@/lib/inventory/import-selection'
import { prisma } from '@/lib/prisma'

/**
 * Archive/check Excel of fuel-import slips: one row per delivery, filterable by station,
 * date range, hầm, nhiên liệu and người nhập. Plain formatting on purpose — this file is
 * for record-keeping, not an accounting template.
 *
 * The bộ lọc is read by the same function the Lịch sử nhập hàng tab reads it with, and
 * narrowed against the same options, so the file holds exactly the phiếu nhập the screen
 * says it is showing — no filter means every one of them, not a window this route picked
 * on its own.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(req.url)
  const stationId = searchParams.get('stationId')

  if (stationId && !(await canReachStation(user, stationId))) return forbidden()

  // One trạm by its parameter, or every trạm the viewer can reach — worked out once, since
  // both the options and the selection are scoped by it.
  const scope = stationId ?? { in: await reachableStationIds(user) }
  const offered = await loadImportFilterOptions(scope)
  const selection = importSelection(
    {
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
      tank: searchParams.get('tank') ?? undefined,
      fuel: searchParams.get('fuel') ?? undefined,
      creator: searchParams.get('creator') ?? undefined,
    },
    scope,
    { ...offered, creators: offered.creators.map((creator) => creator.id) }
  )
  // Oldest first, and every matching row rather than a page: an archive is read from
  // the top and is not paged.
  const imports = await prisma.fuelImport.findMany({
    where: selection.where,
    orderBy: { importedAt: 'asc' },
  })
  const [stations, docs, profiles] = await Promise.all([
    prisma.station.findMany({ select: { id: true, code: true, name: true } }),
    prisma.fuelImportDocument.findMany({
      where: {
        OR: [
          { importId: { in: imports.map((i) => i.id) } },
          { receiptId: { in: imports.map((i) => i.receiptId).filter((r): r is string => !!r) } },
        ],
      },
      select: { importId: true, receiptId: true },
    }),
    prisma.profile.findMany({ select: { id: true, fullName: true } }),
  ])
  const stationById = new Map(stations.map((s) => [s.id, s]))
  const nameById = new Map(profiles.map((p) => [p.id, p.fullName]))
  const docCount = new Map<string, number>()
  const receiptDocCount = new Map<string, number>()
  for (const doc of docs) {
    if (doc.importId) docCount.set(doc.importId, (docCount.get(doc.importId) ?? 0) + 1)
    else if (doc.receiptId)
      receiptDocCount.set(doc.receiptId, (receiptDocCount.get(doc.receiptId) ?? 0) + 1)
  }

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Nhập hàng')
  ws.columns = [
    { header: 'Ngày giờ nhập', key: 'importedAt', width: 18 },
    { header: 'Lưu lúc', key: 'savedAt', width: 18 },
    { header: 'Trạm', key: 'station', width: 16 },
    { header: 'Hầm', key: 'tank', width: 10 },
    { header: 'Loại hàng', key: 'fuel', width: 12 },
    { header: 'Số lít thực tế', key: 'liters', width: 14 },
    { header: 'Số lít V15', key: 'litersV15', width: 12 },
    { header: 'Nhiệt độ (°C)', key: 'temp', width: 12 },
    { header: 'Nhà cung cấp', key: 'supplier', width: 20 },
    { header: 'Số hóa đơn', key: 'invoice', width: 16 },
    { header: 'Xe bồn', key: 'truck', width: 14 },
    { header: 'Người nhập', key: 'creator', width: 18 },
    { header: 'Ghi chú', key: 'note', width: 24 },
    { header: 'Chứng từ', key: 'docs', width: 10 },
    { header: 'Trạng thái', key: 'status', width: 12 },
  ]
  ws.getRow(1).font = { bold: true }

  // "Loại hàng" is the tên of the danh mục row, so a nhiên liệu added in Cài đặt MISA
  // exports under its name rather than its khóa.
  const fuelLabel = await fuelTypeLabeller()
  for (const row of imports) {
    const station = stationById.get(row.stationId)
    ws.addRow({
      importedAt: row.importedAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
      savedAt: row.createdAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
      station: station?.name ?? station?.code ?? '',
      tank: row.tankCode.replace('HAM_', 'Hầm '),
      fuel: fuelLabel(row.fuelType),
      liters: Number(row.litersActual),
      litersV15: row.litersV15 === null ? '' : Number(row.litersV15),
      temp: row.temperatureC === null ? '' : Number(row.temperatureC),
      supplier: row.supplier ?? '',
      invoice: row.invoiceNo ?? '',
      truck: row.truckPlate ?? '',
      creator: (row.createdBy && nameById.get(row.createdBy)) || '',
      note: row.note ?? '',
      docs:
        (docCount.get(row.id) ?? 0) +
        (row.receiptId ? (receiptDocCount.get(row.receiptId) ?? 0) : 0),
      status: row.canceledAt ? 'Đã hủy' : '',
    })
  }

  const buffer = await wb.xlsx.writeBuffer()
  const code = stationId ? (stationById.get(stationId)?.code ?? 'tram') : 'tat-ca'
  // Named from the ngày as applied rather than from the instants they parsed to: a
  // `+07:00` bound renders as the previous UTC day, which is not the ngày kế toán
  // asked for. An unfiltered export is named for what it is. Only the ngày make the
  // name — three multi-selects spelled out would not be a filename anyone could read.
  const span = [selection.from, selection.to].filter(Boolean).join('-') || 'tat-ca'
  const filename = `nhap-hang-${code}-${span}.xlsx`
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
