import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { type ShiftStatus, canEditClosing } from '@/lib/auth/reading-policy'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { type Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'

// A plain decimal literal — digits and an optional fractional tail — which is all the
// column can hold. `Number()` would also swallow "1e5", "0x1a" and " 12 ", each of
// which reaches a Decimal(15,3) as a database error rather than as an answer.
const decimalLiteral = /^-?\d+(\.\d+)?$/

// Litres arrive as a string, like every other number the reading cells post. Being a
// decimal at all is the column's own demand and so this route's business; how much of
// a purge is *possible* — never more than the đồng hồ điện tử counted — is a rule of
// its own and not yet written.
const airPurgeSchema = z.object({
  airPurgeLiters: z.string().regex(decimalLiteral).nullable().optional(),
  airPurgeNote: z.string().nullable().optional(),
})

/**
 * Records the Xả gió on a ca's reading — the litres pumped through the trụ only to
 * push air out of the line, which both đồng hồ counted and nobody bought. Litres and
 * the reason are written independently, so saving one never clears the other, and
 * `null` returns the trụ to having no purge rather than to a purge of zero.
 *
 * Admin at any status, accountant until the ca is chốt — the same rule as a closing
 * correction, since a purge moves the same money. A reading already duyệt/từ chối is
 * deliberately **not** frozen against it: duyệt settles how the meter was read, and a
 * purge is an unrelated assertion about what happened at the trạm. See
 * docs/adr/0002-air-purge-is-not-frozen-by-reading-approval.md.
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
  if (!canEditClosing(user.role, shift.status as ShiftStatus)) return forbidden()

  const data: Prisma.ShiftReadingUpdateInput = {}
  if (parsed.data.airPurgeLiters !== undefined) data.airPurgeLiters = parsed.data.airPurgeLiters
  if (parsed.data.airPurgeNote !== undefined) data.airPurgeNote = parsed.data.airPurgeNote

  const updated = await prisma.shiftReading.update({ where: { id }, data })
  await writeAudit({
    userId: user.id,
    action: 'reading.air_purge.set',
    entity: 'shift_reading',
    entityId: id,
    metadata: parsed.data,
  })
  return ok(updated)
}
