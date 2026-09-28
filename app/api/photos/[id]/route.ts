import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { type ShiftStatus, canEditClosing } from '@/lib/auth/reading-policy'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { lockOpenShift, shiftLockRefusal } from '@/lib/shifts/opening-reading'
import { deletePhoto } from '@/lib/storage/photo-storage'
import { vi } from '@/messages/vi'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params
  const photo = await prisma.shiftPhoto.findUnique({ where: { id } })
  if (!photo) return notFound()
  if (!photo.shiftId) return badRequest(vi.photoFix.notUnmatched)
  const shift = await prisma.shift.findUnique({ where: { id: photo.shiftId } })
  if (!shift) return notFound()
  if (!(await canReachStation(user, shift.stationId))) return forbidden()
  if (!canEditClosing(user.role, shift.status as ShiftStatus)) return forbidden()

  const result = await prisma
    .$transaction(
      async (tx) => {
        await lockOpenShift(tx, shift.id)
        const current = await tx.shiftPhoto.findUnique({ where: { id } })
        if (!current) return notFound()
        if (
          current.shiftId !== shift.id ||
          current.matchedReadingId ||
          !['unmatched', 'ambiguous'].includes(current.matchStatus) ||
          // A debt upload is briefly unmatched before its visit is created. It is
          // not a ca photo even though it already has a shiftId.
          (current.source === 'web_upload' && current.storagePath?.split('/')[1] !== 'shift')
        ) {
          return badRequest(vi.photoFix.notUnmatched)
        }
        const [reading, visit, dip] = await Promise.all([
          tx.shiftReading.findFirst({
            where: { OR: [{ electronicPhotoId: id }, { mechanicalPhotoId: id }] },
            select: { id: true },
          }),
          tx.debtVehicleVisit.findFirst({
            where: { OR: [{ vehiclePhotoId: id }, { meterPhotoId: id }] },
            select: { id: true },
          }),
          tx.tankDipRecord.findFirst({ where: { photoId: id }, select: { id: true } }),
        ])
        if (reading || visit || dip) return badRequest(vi.photoFix.notUnmatched)
        await tx.shiftPhoto.delete({ where: { id } })
        await writeAudit(
          {
            userId: user.id,
            action: 'photo.delete',
            entity: 'shift_photo',
            entityId: id,
            metadata: {
              shiftId: shift.id,
              matchStatus: current.matchStatus,
              matchedReadingId: current.matchedReadingId,
              meterType: current.meterType,
              extractedReading: current.extractedReading?.toString() ?? null,
              storagePath: current.storagePath,
            },
          },
          tx
        )
        return current.storagePath
      },
      { timeout: 15000 }
    )
    .catch(shiftLockRefusal)
  if (result instanceof Response) return result
  if (result) {
    await deletePhoto(result).catch((error: unknown) => {
      logger.error({ error, photoId: id, path: result }, 'Failed to delete shift photo file')
    })
  }
  return ok({ id })
}
