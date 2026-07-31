import ExcelJS from 'exceljs'

import { type NextRequest } from 'next/server'

import { unauthorized } from '@/lib/api/response'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Archive/check Excel of fuel-import slips: one row per delivery, filterable by
 * station and date range (defaults to the last 31 days). Plain formatting on
 * purpose — this file is for record-keeping, not an accounting template.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(req.url)
  const stationId = searchParams.get('stationId')
  const to = searchParams.get('to')
    ? new Date(`${searchParams.get('to')}T23:59:59+07:00`)
    : new Date()
  const from = searchParams.get('from')
    ? new Date(`${searchParams.get('from')}T00:00:00+07:00`)
    : new Date(to.getTime() - 31 * DAY_MS)

  const imports = await prisma.fuelImport.findMany({
    where: {
      ...(stationId ? { stationId } : {}),
      importedAt: { gte: from, lte: to },
    },
    orderBy: { importedAt: 'asc' },
  })
  const [stations, docs, profiles] = await Promise.all([
    prisma.station.findMany({ select: { id: true, code: true, name: true } }),
    prisma.fuelImportDocument.findMany({
      where: { importId: { in: imports.map((i) => i.id) } },
      select: { importId: true },
    }),
    prisma.profile.findMany({ select: { id: true, fullName: true } }),
  ])
  const stationById = new Map(stations.map((s) => [s.id, s]))
  const nameById = new Map(profiles.map((p) => [p.id, p.fullName]))
  const docCount = new Map<string, number>()
  for (const doc of docs) docCount.set(doc.importId, (docCount.get(doc.importId) ?? 0) + 1)

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Nhập hàng')
  ws.columns = [
    { header: 'Ngày giờ nhập', key: 'importedAt', width: 18 },
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

  const fuelLabels = vi.fuelType as Record<string, string>
  for (const row of imports) {
    const station = stationById.get(row.stationId)
    ws.addRow({
      importedAt: row.importedAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
      station: station?.name ?? station?.code ?? '',
      tank: row.tankCode.replace('HAM_', 'Hầm '),
      fuel: fuelLabels[row.fuelType] ?? row.fuelType,
      liters: Number(row.litersActual),
      litersV15: row.litersV15 === null ? '' : Number(row.litersV15),
      temp: row.temperatureC === null ? '' : Number(row.temperatureC),
      supplier: row.supplier ?? '',
      invoice: row.invoiceNo ?? '',
      truck: row.truckPlate ?? '',
      creator: (row.createdBy && nameById.get(row.createdBy)) || '',
      note: row.note ?? '',
      docs: docCount.get(row.id) ?? 0,
      status: row.canceledAt ? 'Đã hủy' : '',
    })
  }

  const buffer = await wb.xlsx.writeBuffer()
  const code = stationId ? (stationById.get(stationId)?.code ?? 'tram') : 'tat-ca'
  const filename = `nhap-hang-${code}-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.xlsx`
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
