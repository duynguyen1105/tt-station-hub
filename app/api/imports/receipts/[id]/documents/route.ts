import { type NextRequest } from 'next/server'

import { badRequest, created, forbidden, notFound, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { prisma } from '@/lib/prisma'
import { uploadPhoto } from '@/lib/storage/photo-storage'

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

/**
 * Second wizard step: archives ALL photos related to the delivery session
 * (seals, tanker gauges, dip sticks, pumps...) against the confirmed receipt,
 * kept for later reconciliation.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role === 'viewer') return forbidden()

  const { id } = await ctx.params
  const receipt = await prisma.fuelImportReceipt.findUnique({
    where: { id },
    select: { id: true, stationId: true },
  })
  if (!receipt) return notFound()
  if (!(await canReachStation(user, receipt.stationId))) return forbidden()
  const station = await prisma.station.findUnique({
    where: { id: receipt.stationId },
    select: { code: true },
  })
  if (!station) return notFound()

  const form = await req.formData().catch(() => null)
  if (!form) return badRequest()
  const files = form.getAll('photos').filter((f): f is File => f instanceof File)
  if (files.length === 0) return badRequest()

  // Offset so a second batch never overwrites the first one's paths.
  const existing = await prisma.fuelImportDocument.count({
    where: { receiptId: receipt.id, kind: 'related' },
  })
  let uploaded = 0
  for (const [index, file] of files.entries()) {
    try {
      const ext = EXT_BY_TYPE[file.type] ?? 'jpg'
      const path = `${station.code}/imports/receipts/${receipt.id}/related-${existing + index}.${ext}`
      await uploadPhoto(path, Buffer.from(await file.arrayBuffer()), file.type || 'image/jpeg')
      await prisma.fuelImportDocument.create({
        data: {
          receiptId: receipt.id,
          kind: 'related',
          storagePath: path,
          fileName: file.name || null,
          contentType: file.type || null,
        },
      })
      uploaded++
    } catch {
      // Skip the failed file; the client reports how many made it.
    }
  }

  await writeAudit({
    userId: user.id,
    action: 'fuel_import_receipt.documents',
    entity: 'fuel_import_receipt',
    entityId: receipt.id,
    metadata: { photos: uploaded },
  })
  return created({ photos: uploaded })
}
