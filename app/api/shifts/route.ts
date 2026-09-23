import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { canEditCashEntries } from '@/lib/auth/reading-policy'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { dayKeyOf } from '@/lib/debts/ledger'
import { findOrCreateShift, shiftDateFor } from '@/lib/photos/ingest'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

const bodySchema = z.object({
  stationId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

/**
 * Opens the ca of a day that has none, so its Thu chi table can record thu nợ. Returns
 * the existing ca when the day already has one.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!canEditCashEntries(user.role)) return forbidden()

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  const { stationId, date } = parsed.data

  if (!(await canReachStation(user, stationId))) return forbidden()
  const station = await prisma.station.findFirst({
    where: { id: stationId, isActive: true },
    select: { id: true },
  })
  if (!station) return badRequest('Trạm không hợp lệ.')
  if (date > dayKeyOf(shiftDateFor(Date.now()))) return badRequest(vi.debts.openShiftFuture)

  // 05:00 UTC is 12:00 GMT+7: the same calendar day, whatever the offset math does.
  const shift = await findOrCreateShift(stationId, Date.parse(`${date}T05:00:00.000Z`))
  await writeAudit({
    userId: user.id,
    action: 'shift.open_manual',
    entity: 'shift',
    entityId: shift.id,
    metadata: { stationId, date },
  })
  return ok({ id: shift.id })
}
