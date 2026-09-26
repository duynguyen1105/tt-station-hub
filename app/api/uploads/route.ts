import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { type ShiftStatus, canEditClosing } from '@/lib/auth/reading-policy'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { shiftDateFor, shiftTypeFor } from '@/lib/photos/ingest'
import {
  PHOTO_COUNTS,
  ShiftClosedError,
  UPLOAD_KINDS,
  ingestUpload,
  uploadTimestamp,
} from '@/lib/photos/upload'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

export const runtime = 'nodejs'
export const maxDuration = 60

const fieldsSchema = z.object({
  kind: z.enum(UPLOAD_KINDS),
  stationId: z.string().uuid(),
  day: z.string(),
  note: z.string().trim().max(500).optional(),
})

/**
 * Tải ảnh: one item per request — a Chốt ca or Đo bồn photo, or one lượt xe công nợ
 * (a pair, or one walk-in photo). The browser has already re-encoded every photo to a
 * JPEG well under the body cap.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role === 'viewer') return forbidden()

  const form = await req.formData().catch(() => null)
  if (!form) return badRequest()
  const field = (name: string) => form.get(name) ?? undefined
  const parsed = fieldsSchema.safeParse({
    kind: field('kind'),
    stationId: field('stationId'),
    day: field('day'),
    note: field('note'),
  })
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  const { kind, stationId, day } = parsed.data
  const note = parsed.data.note || null

  const photos = form.getAll('photos')
  if (
    !PHOTO_COUNTS[kind].includes(photos.length) ||
    !photos.every((p) => p instanceof File && p.size > 0 && p.type === 'image/jpeg')
  ) {
    return badRequest()
  }

  if (!(await canReachStation(user, stationId))) return forbidden()
  const station = await prisma.station.findFirst({
    where: { id: stationId, isActive: true },
    select: { id: true, code: true },
  })
  if (!station) return badRequest()

  const timestamp = uploadTimestamp(day, Date.now())
  if (timestamp === null) return badRequest(vi.upload.badDay)

  // A chốt'd ca takes no more ảnh chốt ca until an admin Mở lại ca — the same rule as
  // Gán ảnh (POST /api/photos/[id]/assign). Checked here before the AI read is paid for;
  // ingestUpload checks again for a photo whose printed label names another trạm.
  if (kind === 'shift') {
    const shift = await prisma.shift.findUnique({
      where: {
        stationId_shiftDate_shiftType: {
          stationId,
          shiftDate: shiftDateFor(timestamp),
          shiftType: shiftTypeFor(),
        },
      },
      select: { status: true },
    })
    if (shift && !canEditClosing(user.role, shift.status as ShiftStatus)) {
      return badRequest(vi.upload.shiftClosed)
    }
  }

  // PHOTO_COUNTS was checked above: one photo, or a công nợ pair.
  const buffers = (await Promise.all(
    (photos as File[]).map(async (p) => Buffer.from(await p.arrayBuffer()))
  )) as [Buffer] | [Buffer, Buffer]
  let photoIds: string[]
  try {
    photoIds = await ingestUpload({
      kind,
      station,
      timestamp,
      senderName: user.fullName,
      note,
      buffers,
    })
  } catch (error) {
    if (error instanceof ShiftClosedError) return badRequest(vi.upload.shiftClosed)
    throw error
  }
  await writeAudit({
    userId: user.id,
    action: 'photo.upload',
    entity: 'shift_photo',
    entityId: photoIds[0],
    metadata: { kind, stationId, day, note, photoIds },
  })
  return ok({ photoIds })
}
