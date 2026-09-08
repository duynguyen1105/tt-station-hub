import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { type ShiftStatus, canEditClosing, isReadingDecided } from '@/lib/auth/reading-policy'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { runShiftExtraction } from '@/lib/photos/ingest'
import { prisma } from '@/lib/prisma'
import { downloadPhoto } from '@/lib/storage/photo-storage'
import { vi } from '@/messages/vi'

const assignSchema = z.object({
  dispenserId: z.string().uuid(),
  slot: z.enum(['electronic', 'mechanical']),
})

/**
 * Gán an unmatched photo of a ca to a Trụ and a đồng hồ by hand — the way back
 * for a photo the AI could not place (a mechanical window the router missed, a
 * plate-less LCD, a failed pass). Re-runs the ordinary intake with the reviewer's
 * choice as the ManualOverride, and with the router forced to the chosen slot so
 * the matching reader is the one that reads the number: the reading lands in the
 * row exactly as a recognised photo would have.
 *
 * Gates follow the reading policy: whoever may edit a closing may attach a photo
 * to it (admin at any status, accountant until chốt), and a row already duyệt'd /
 * từ chối'd is closed — attaching re-derives its value and would silently
 * un-decide it.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params

  const parsed = assignSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  const { dispenserId, slot } = parsed.data

  const photo = await prisma.shiftPhoto.findUnique({ where: { id } })
  if (!photo) return notFound()
  if (!photo.shiftId || !photo.storagePath) return badRequest(vi.unmatchedPhotos.notAssignable)
  const shift = await prisma.shift.findUnique({ where: { id: photo.shiftId } })
  if (!shift) return notFound()
  // The ca's own trạm decides, as it does for every other write on a reading.
  if (!(await canReachStation(user, shift.stationId))) return forbidden()
  if (!canEditClosing(user.role, shift.status as ShiftStatus)) return forbidden()

  // A Trụ of another trạm — or one since retired — is not addressable through
  // this ca, however the identifier was come by.
  const dispenser = await prisma.dispenser.findFirst({
    where: { id: dispenserId, stationId: shift.stationId, isActive: true },
  })
  if (!dispenser) return notFound()
  if (slot === 'electronic' ? !dispenser.hasElectronicMeter : !dispenser.hasMechanicalMeter) {
    return badRequest(vi.unmatchedPhotos.slotMissing)
  }
  const existing = await prisma.shiftReading.findUnique({
    where: { shiftId_dispenserId: { shiftId: shift.id, dispenserId } },
    select: { reviewStatus: true },
  })
  if (existing && isReadingDecided(existing.reviewStatus)) return forbidden()

  const buffer = await downloadPhoto(photo.storagePath)
  const result = await runShiftExtraction(
    photo.id,
    buffer,
    { id: shift.id, stationId: shift.stationId },
    { dispenserId, slot },
    {
      image_type: slot === 'mechanical' ? 'mechanical_meter' : 'electronic_meter',
      confidence: 100,
      notes: 'slot assigned by reviewer',
    }
  )
  await writeAudit({
    userId: user.id,
    action: 'photo.assign',
    entity: 'shift_photo',
    entityId: photo.id,
    metadata: { shiftId: shift.id, dispenserId, slot, reading: result.reading },
  })
  return ok({ reading: result.reading, meterType: result.meterType })
}
