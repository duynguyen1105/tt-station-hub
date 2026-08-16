import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, created, forbidden, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { canAccessStation } from '@/lib/auth/station-access'
import { prisma } from '@/lib/prisma'
import { uploadPhoto } from '@/lib/storage/photo-storage'

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

const importSchema = z.object({
  stationId: z.string().uuid(),
  tankCode: z
    .string()
    .trim()
    .min(1)
    .transform((value) => value.toUpperCase().replace(/[\s-]+/g, '_')),
  fuelType: z.string().trim().min(1),
  litersActual: z.coerce.number().positive(),
  litersV15: z.coerce.number().positive().optional(),
  temperatureC: z.coerce.number().min(-20).max(80).optional(),
  supplier: z.string().trim().optional(),
  invoiceNo: z.string().trim().optional(),
  truckPlate: z.string().trim().optional(),
  note: z.string().trim().optional(),
  importedAt: z.coerce.date(),
})

/**
 * Records one tanker delivery (nhập hàng): the FuelImport row, its attached
 * documents (multipart files), and the +import inventory movement that bumps
 * the station's estimated stock.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role === 'viewer') return forbidden()

  const form = await req.formData().catch(() => null)
  if (!form) return badRequest()
  const fields: Record<string, string> = {}
  for (const key of [
    'stationId',
    'tankCode',
    'fuelType',
    'litersActual',
    'litersV15',
    'temperatureC',
    'supplier',
    'invoiceNo',
    'truckPlate',
    'note',
    'importedAt',
  ]) {
    const value = form.get(key)
    if (typeof value === 'string' && value.trim() !== '') fields[key] = value
  }
  const parsed = importSchema.safeParse(fields)
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  const data = parsed.data

  const station = await prisma.station.findFirst({
    where: { id: data.stationId, isActive: true },
    select: { id: true, code: true, assignedAccountantId: true },
  })
  if (!station) return badRequest('Trạm không hợp lệ.')
  if (!canAccessStation(user, station)) return forbidden()

  const record = await prisma.$transaction(async (tx) => {
    const row = await tx.fuelImport.create({
      data: {
        stationId: data.stationId,
        tankCode: data.tankCode,
        fuelType: data.fuelType,
        litersActual: data.litersActual,
        litersV15: data.litersV15,
        temperatureC: data.temperatureC,
        supplier: data.supplier,
        invoiceNo: data.invoiceNo,
        truckPlate: data.truckPlate,
        note: data.note,
        importedAt: data.importedAt,
        createdBy: user.id,
      },
    })
    await tx.inventoryMovement.create({
      data: {
        stationId: data.stationId,
        fuelType: data.fuelType,
        movementType: 'import',
        quantity: data.litersActual,
        sourceRef: row.id,
        note: data.invoiceNo ? `Nhập hàng — HĐ ${data.invoiceNo}` : 'Nhập hàng',
        movementDate: data.importedAt,
        createdBy: user.id,
      },
    })
    await tx.inventoryBalance.upsert({
      where: { stationId_fuelType: { stationId: data.stationId, fuelType: data.fuelType } },
      update: { estimatedStock: { increment: data.litersActual } },
      create: {
        stationId: data.stationId,
        fuelType: data.fuelType,
        estimatedStock: data.litersActual,
      },
    })
    return row
  })

  // Documents upload AFTER the row exists (paths carry the import id). A failed
  // upload never loses the slip itself — the doc list just ends up shorter.
  const files = form.getAll('documents').filter((f): f is File => f instanceof File)
  let uploaded = 0
  for (const [index, file] of files.entries()) {
    try {
      const ext = EXT_BY_TYPE[file.type] ?? 'jpg'
      const path = `${station.code}/imports/${record.id}-${index}.${ext}`
      await uploadPhoto(path, Buffer.from(await file.arrayBuffer()), file.type || 'image/jpeg')
      await prisma.fuelImportDocument.create({
        data: {
          importId: record.id,
          storagePath: path,
          fileName: file.name || null,
          contentType: file.type || null,
        },
      })
      uploaded++
    } catch {
      // Logged size only — the slip stays valid without this document.
    }
  }

  await writeAudit({
    userId: user.id,
    action: 'fuel_import.create',
    entity: 'fuel_import',
    entityId: record.id,
    metadata: { ...fields, documents: uploaded },
  })
  return created({ id: record.id, documents: uploaded })
}
