import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { canEditCashEntries } from '@/lib/auth/reading-policy'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { prisma } from '@/lib/prisma'
import { normalizeCashEntries, refuseCashEntries } from '@/lib/shifts/cash-entries'

const entrySchema = z.object({
  content: z.string().max(500),
  counterparty: z.string().max(500),
  receipt: z.string().max(30),
  payment: z.string().max(30),
})

const cashEntriesSchema = z.object({
  entries: z.array(entrySchema).max(100),
})

/**
 * Saves a ca's Thu chi tiền mặt – Khách CK note: the whole table as it stands on screen
 * replaces what was stored, in order, blank rows dropped. What an amount may be is
 * refuseCashEntries's to decide, the same rule the table applies before posting.
 *
 * Admin and accountant at any status — `canEditCashEntries`. The rows are a note nothing
 * on the ca is derived from, so chốt ca does not lock them.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params

  const parsed = cashEntriesSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())

  const shift = await prisma.shift.findUnique({ where: { id } })
  if (!shift) return notFound()
  if (!(await canReachStation(user, shift.stationId))) return forbidden()
  if (!canEditCashEntries(user.role)) return forbidden()

  const refusal = refuseCashEntries(parsed.data.entries)
  if (refusal) return badRequest(refusal)

  const entries = normalizeCashEntries(parsed.data.entries)
  await prisma.$transaction(async (tx) => {
    await tx.shiftCashEntry.deleteMany({ where: { shiftId: id } })
    await tx.shiftCashEntry.createMany({
      data: entries.map((entry, position) => ({ ...entry, shiftId: id, position })),
    })
    await writeAudit(
      {
        userId: user.id,
        action: 'shift.cash_entries.set',
        entity: 'shift',
        entityId: id,
        metadata: { entries },
      },
      tx
    )
  })
  return ok({ count: entries.length })
}
