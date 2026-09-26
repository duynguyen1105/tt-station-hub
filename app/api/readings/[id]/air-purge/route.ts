import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { type ShiftStatus, canEditAirPurge } from '@/lib/auth/reading-policy'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { type Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { refuseAirPurge } from '@/lib/shifts/air-purge'
import { lockOpenShift, shiftLockRefusal } from '@/lib/shifts/opening-reading'
import { electronicGap, readingMeters } from '@/lib/shifts/reading-totals'

// Litres arrive as a string, like every other number the reading cells post. What that
// string may say — a plain decimal the column can hold, and never more than the đồng hồ
// điện tử counted — is refuseAirPurge's to decide, applied below against this reading's
// own meters, so the cell on screen and this route turn away the same entries with the
// same words.
const airPurgeSchema = z.object({
  airPurgeLiters: z.string().nullable().optional(),
})

/**
 * Records the Xả gió on a ca's reading — the litres pumped through the trụ only to
 * push air out of the line, which both đồng hồ counted and nobody bought. `null`
 * returns the trụ to having no purge rather than to a purge of zero.
 *
 * Admin and accountant may record it before Chốt ca, never after. A reading
 * already duyệt/từ chối is not independently frozen against Xả gió: that
 * decision settled the meter value, not what happened at the trạm.
 *
 * A purge above the trụ's own Lít ĐT is refused here, by the same rule the cell on
 * screen applies, so the two can never disagree about what is recordable.
 *
 * Who changed it and when are the audit entry's, not columns of their own.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params

  const parsed = airPurgeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())

  const reading = await prisma.shiftReading.findUnique({ where: { id } })
  if (!reading) return notFound()
  const shift = await prisma.shift.findUnique({ where: { id: reading.shiftId } })
  if (!shift) return notFound()
  // The ca's own trạm decides, as it does for every other write on a reading.
  if (!(await canReachStation(user, shift.stationId))) return forbidden()
  if (!canEditAirPurge(user.role, shift.status as ShiftStatus)) return forbidden()

  const data: Prisma.ShiftReadingUpdateInput = {}
  if (parsed.data.airPurgeLiters !== undefined) {
    // Against this trụ's own litres — the reading on file, not any the caller sent.
    const refusal = refuseAirPurge(
      parsed.data.airPurgeLiters,
      electronicGap(readingMeters(reading))
    )
    if (refusal) return badRequest(refusal)
    data.airPurgeLiters = parsed.data.airPurgeLiters
  }

  // Xả gió moves the ca's sale, so it takes the ca's lock like a số liệu edit.
  const updated = await prisma
    .$transaction(async (db) => {
      await lockOpenShift(db, reading.shiftId)
      const row = await db.shiftReading.update({ where: { id }, data })
      await writeAudit(
        {
          userId: user.id,
          action: 'reading.air_purge.set',
          entity: 'shift_reading',
          entityId: id,
          metadata: parsed.data,
        },
        db
      )
      return row
    })
    .catch(shiftLockRefusal)
  if (updated instanceof Response) return updated
  return ok(updated)
}
