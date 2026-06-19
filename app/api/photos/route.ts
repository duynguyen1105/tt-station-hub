import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, created, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { ingestManualPhoto } from '@/lib/photos/ingest'
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
  const caption =
    typeof captionRaw === 'string' && captionRaw.trim() !== '' ? captionRaw.trim() : null

  const station = await prisma.station.findFirst({
    where: { id: stationId, isActive: true },
    select: { id: true, code: true },
  })
  if (!station) return badRequest('Không tìm thấy trạm.')

  const buffer = Buffer.from(await file.arrayBuffer())
  const result = await ingestManualPhoto({
    station,
    buffer,
    contentType: file.type,
    caption,
    kind,
  })

  await writeAudit({
    userId: user.id,
    action: 'photo.upload',
    entity: 'shift_photo',
    entityId: result.photoId,
  })

  return created(result)
}
