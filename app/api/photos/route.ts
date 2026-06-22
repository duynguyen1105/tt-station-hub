import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, created, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { type ManualOverride, ingestManualPhoto } from '@/lib/photos/ingest'
import { prisma } from '@/lib/prisma'

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const idSchema = z.string().uuid()

/**
 * Manual photo upload: the non-Zalo entry point into the store -> AI -> review
 * pipeline. Accepts a multipart form (file + stationId + optional kind/caption),
 * stores the image, and returns the AI extraction so the result is visible at once.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const form = await req.formData().catch(() => null)
  if (!form) return badRequest('Yêu cầu không hợp lệ.')

  const file = form.get('file')
  const stationId = form.get('stationId')
  const captionRaw = form.get('caption')
  const kindRaw = form.get('kind')

  if (!(file instanceof File) || file.size === 0) return badRequest('Vui lòng chọn một ảnh.')
  if (!file.type.startsWith('image/')) return badRequest('Tệp tải lên phải là ảnh.')
  if (file.size > MAX_BYTES) return badRequest('Ảnh vượt quá 10MB.')
  if (typeof stationId !== 'string' || !idSchema.safeParse(stationId).success) {
    return badRequest('Vui lòng chọn trạm hợp lệ.')
  }

  const kind = kindRaw === 'debt' ? 'debt' : kindRaw === 'shift' ? 'shift' : undefined
  const debtTypeRaw = form.get('debtType')
  const debtType =
    debtTypeRaw === 'vehicle' ? 'vehicle' : debtTypeRaw === 'debt_meter' ? 'debt_meter' : undefined
  const caption =
    typeof captionRaw === 'string' && captionRaw.trim() !== '' ? captionRaw.trim() : null

  const station = await prisma.station.findFirst({
    where: { id: stationId, isActive: true },
    select: { id: true, code: true },
  })
  if (!station) return badRequest('Không tìm thấy trạm.')

  // Optional manual assignment: force the pump (and meter slot) for label-less photos.
  const dispenserIdRaw = form.get('dispenserId')
  const meterSlotRaw = form.get('meterSlot')
  let override: ManualOverride | undefined
  if (typeof dispenserIdRaw === 'string' && idSchema.safeParse(dispenserIdRaw).success) {
    const dispenser = await prisma.dispenser.findFirst({
      where: { id: dispenserIdRaw, stationId: station.id, isActive: true },
      select: { id: true },
    })
    if (!dispenser) return badRequest('Trụ không hợp lệ cho trạm này.')
    const slot =
      meterSlotRaw === 'electronic'
        ? 'electronic'
        : meterSlotRaw === 'mechanical'
          ? 'mechanical'
          : null
    override = { dispenserId: dispenser.id, slot }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const result = await ingestManualPhoto({
    station,
    buffer,
    contentType: file.type,
    caption,
    kind,
    override,
    debtType,
  })

  await writeAudit({
    userId: user.id,
    action: 'photo.upload',
    entity: 'shift_photo',
    entityId: result.photoId,
  })

  return created(result)
}
