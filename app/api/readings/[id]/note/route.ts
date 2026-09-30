import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { canEditReadingNote } from '@/lib/auth/reading-policy'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { prisma } from '@/lib/prisma'

const noteSchema = z.object({
  note: z.string().max(500).nullable(),
})

/**
 * Records the Ghi chú on a ca's reading — free text about the trụ on this ca, the
 * phiếu chốt ca's own Ghi chú column. Blank clears it.
 *
 * Admin and accountant may write it at any status: a note moves no figure, so it
 * takes neither the chốt lock nor the ca's row lock.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params

  const parsed = noteSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())

  const reading = await prisma.shiftReading.findUnique({ where: { id } })
  if (!reading) return notFound()
  const shift = await prisma.shift.findUnique({ where: { id: reading.shiftId } })
  if (!shift) return notFound()
  if (!(await canReachStation(user, shift.stationId))) return forbidden()
  if (!canEditReadingNote(user.role)) return forbidden()

  const note = parsed.data.note?.trim() || null
  const updated = await prisma.$transaction(async (db) => {
    const row = await db.shiftReading.update({ where: { id }, data: { note } })
    await writeAudit(
      {
        userId: user.id,
        action: 'reading.note.set',
        entity: 'shift_reading',
        entityId: id,
        metadata: { note },
      },
      db
    )
    return row
  })
  return ok(updated)
}
