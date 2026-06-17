import { notFound, unauthorized } from '@/lib/api/response'
import { getCurrentUser } from '@/lib/auth/session'
import { formatDate } from '@/lib/format'
import { type MisaRow, buildMisaWorkbook, workbookToBuffer } from '@/lib/misa-export/shift-to-excel'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params

  const shift = await prisma.shift.findUnique({ where: { id } })
  if (!shift) return notFound()

  const [station, readings, dispensers] = await Promise.all([
    prisma.station.findUnique({ where: { id: shift.stationId } }),
    prisma.shiftReading.findMany({ where: { shiftId: id } }),
    prisma.dispenser.findMany({ where: { stationId: shift.stationId } }),
  ])

  const dispenserById = new Map(dispensers.map((d) => [d.id, d]))

  // PLACEHOLDER mapping — refine once the MISA template is provided.
  const rows: MisaRow[] = readings.map((r) => {
    const dispenser = dispenserById.get(r.dispenserId)
    return {
      date: formatDate(shift.shiftDate),
      stationCode: station?.code ?? '',
      dispenserCode: dispenser?.code ?? '',
      fuelType: dispenser?.fuelType ?? '',
      openingReading: r.originalElectronicReading?.toString() ?? '',
      closingReading: r.electronicReading?.toString() ?? '',
      liters: Number(r.electronicDelta ?? 0),
      unitPrice: 0,
      amount: 0,
    }
  })

  const buffer = workbookToBuffer(buildMisaWorkbook(rows))
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="misa-${shift.shiftDate.toISOString().slice(0, 10)}.xlsx"`,
    },
  })
}
