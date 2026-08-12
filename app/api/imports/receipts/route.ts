import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, created, forbidden, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'
import { uploadPhoto } from '@/lib/storage/photo-storage'
import { vi } from '@/messages/vi'

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

const optionalText = z
  .string()
  .nullish()
  .transform((value) => {
    const text = value?.trim() ?? ''
    return text === '' ? null : text
  })
const nullableNumber = z.number().finite().nullish().default(null)

const sideSchema = z.object({
  temperatureC: nullableNumber,
  heightMm: nullableNumber,
  bookLiters: nullableNumber,
  baremLiters: nullableNumber,
})

const payloadSchema = z.object({
  stationId: z.string().uuid(),
  importedAt: z.coerce.date(),
  staffName: optionalText,
  driverName: optionalText,
  truckPlate: optionalText,
  vehicleCheck: optionalText,
  note: optionalText,
  products: z
    .array(
      z.object({
        productLabel: z.string().trim().min(1),
        warehouse: optionalText,
        quantityLiters: nullableNumber,
        exportSlipNo: optionalText,
        sealNo: optionalText,
      })
    )
    .default([]),
  compartments: z
    .array(
      z.object({
        compartmentNo: z.number().int().min(1).max(9),
        liters: nullableNumber,
        valvePosition: optionalText,
        compensationLiters: nullableNumber,
        temperatureC: nullableNumber,
      })
    )
    .default([]),
  tanks: z
    .array(
      z.object({
        tankLabel: z.string().trim().min(1),
        tankCode: optionalText,
        fuelType: optionalText,
        importedLiters: nullableNumber,
        before: sideSchema,
        after: sideSchema,
      })
    )
    .default([]),
  pumps: z
    .array(
      z.object({
        pumpLabel: optionalText,
        before: z.object({ electronic: nullableNumber, mechanical: nullableNumber }),
        after: z.object({ electronic: nullableNumber, mechanical: nullableNumber }),
      })
    )
    .default([]),
  rawExtract: z.unknown().nullish(),
})

/**
 * Confirms a reviewed biên bản giao nhận: stores the receipt (all sections as
 * reviewed), creates one FuelImport per tank that actually received fuel
 * (those liters move the inventory balance, same as the classic slip), and
 * attaches the biên bản photos. Related session photos arrive in a second
 * step via /api/imports/receipts/[id]/documents.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role === 'viewer') return forbidden()

  const form = await req.formData().catch(() => null)
  if (!form) return badRequest()
  const payloadText = form.get('payload')
  if (typeof payloadText !== 'string') return badRequest()
  let payloadJson: unknown
  try {
    payloadJson = JSON.parse(payloadText)
  } catch {
    return badRequest()
  }
  const parsed = payloadSchema.safeParse(payloadJson)
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  const data = parsed.data

  const tankImports = data.tanks.filter(
    (t) => t.tankCode && t.fuelType && t.importedLiters !== null && t.importedLiters > 0
  )
  // A row the binding ladder could not attribute (ADR 0004) names no Hầm, so it
  // books nothing. It must not stop the biên bản from being saved either: the
  // paper is the legal record, and the row's measurements are stored with it.
  const unattributed = data.tanks.some((t) => !t.tankCode)
  if (tankImports.length === 0 && !unattributed) return badRequest(vi.imports.noTankLiters)

  const station = await prisma.station.findFirst({
    where: { id: data.stationId, isActive: true },
    select: { id: true, code: true },
  })
  if (!station) return badRequest('Trạm không hợp lệ.')

  const supplier = [...new Set(data.products.map((p) => p.warehouse).filter(Boolean))].join(', ')
  const invoiceNo = [...new Set(data.products.map((p) => p.exportSlipNo).filter(Boolean))].join(
    ', '
  )

  const { receipt, importIds } = await prisma.$transaction(async (tx) => {
    const receiptRow = await tx.fuelImportReceipt.create({
      data: {
        stationId: data.stationId,
        receiptDate: data.importedAt,
        staffName: data.staffName,
        driverName: data.driverName,
        truckPlate: data.truckPlate,
        vehicleCheck: data.vehicleCheck,
        note: data.note,
        products: data.products,
        compartments: data.compartments,
        tankChecks: data.tanks,
        pumpChecks: data.pumps,
        rawExtract: data.rawExtract === undefined ? undefined : (data.rawExtract ?? undefined),
        createdBy: user.id,
      },
    })
    const ids: string[] = []
    for (const tank of tankImports) {
      const row = await tx.fuelImport.create({
        data: {
          stationId: data.stationId,
          receiptId: receiptRow.id,
          tankCode: tank.tankCode!,
          fuelType: tank.fuelType!,
          litersActual: tank.importedLiters!,
          supplier: supplier || null,
          invoiceNo: invoiceNo || null,
          truckPlate: data.truckPlate,
          importedAt: data.importedAt,
          createdBy: user.id,
        },
      })
      ids.push(row.id)
      await tx.inventoryMovement.create({
        data: {
          stationId: data.stationId,
          fuelType: tank.fuelType!,
          movementType: 'import',
          quantity: tank.importedLiters!,
          sourceRef: row.id,
          note: invoiceNo ? `Nhập hàng — PXK ${invoiceNo}` : 'Nhập hàng (biên bản)',
          movementDate: data.importedAt,
          createdBy: user.id,
        },
      })
      await tx.inventoryBalance.upsert({
        where: { stationId_fuelType: { stationId: data.stationId, fuelType: tank.fuelType! } },
        update: { estimatedStock: { increment: tank.importedLiters! } },
        create: {
          stationId: data.stationId,
          fuelType: tank.fuelType!,
          estimatedStock: tank.importedLiters!,
        },
      })
    }
    return { receipt: receiptRow, importIds: ids }
  })

  // Biên bản photos upload AFTER the rows exist (paths carry the receipt id).
  // A failed upload never loses the receipt — the doc list just ends up shorter.
  const files = form.getAll('bienBan').filter((f): f is File => f instanceof File)
  let uploaded = 0
  for (const [index, file] of files.entries()) {
    try {
      const ext = EXT_BY_TYPE[file.type] ?? 'jpg'
      const path = `${station.code}/imports/receipts/${receipt.id}/bien-ban-${index}.${ext}`
      await uploadPhoto(path, Buffer.from(await file.arrayBuffer()), file.type || 'image/jpeg')
      await prisma.fuelImportDocument.create({
        data: {
          receiptId: receipt.id,
          kind: 'bien_ban',
          storagePath: path,
          fileName: file.name || null,
          contentType: file.type || null,
        },
      })
      uploaded++
    } catch {
      // The receipt stays valid without this document.
    }
  }

  await writeAudit({
    userId: user.id,
    action: 'fuel_import_receipt.create',
    entity: 'fuel_import_receipt',
    entityId: receipt.id,
    metadata: { stationId: data.stationId, imports: importIds, bienBanPhotos: uploaded },
  })
  return created({ id: receipt.id, imports: importIds, bienBanPhotos: uploaded })
}
