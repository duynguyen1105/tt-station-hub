import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

const bodySchema = z.object({
  amount: z.number().int().min(0),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

/**
 * Sets a trạm's tiền mặt đầu kỳ — the cash its staff held at the start of `effectiveDate`,
 * the anchor every later ca's Tồn tiền mặt chains from (lib/shifts/load-cash-balance.ts).
 * Admin only, like the số đầu kỳ of the kho; audited with the previous value.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()
  const { id } = await params

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(vi.shifts.cashBalance.invalidAmount)
  const { amount, effectiveDate } = parsed.data
  const date = new Date(`${effectiveDate}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== effectiveDate) {
    return badRequest()
  }

  const station = await prisma.station.findUnique({ where: { id }, select: { id: true } })
  if (!station) return notFound()
  if (!(await canReachStation(user, id))) return forbidden()

  const previous = await prisma.cashOpeningBalance.findUnique({ where: { stationId: id } })
  const row = await prisma.cashOpeningBalance.upsert({
    where: { stationId: id },
    create: { stationId: id, amount, effectiveDate: date, setBy: user.id },
    update: { amount, effectiveDate: date, setBy: user.id },
  })
  await writeAudit({
    userId: user.id,
    action: 'cash_opening.set',
    entity: 'cash_opening_balance',
    entityId: row.id,
    metadata: {
      stationId: id,
      amount,
      effectiveDate,
      previous: previous
        ? {
            amount: previous.amount.toNumber(),
            effectiveDate: previous.effectiveDate.toISOString().slice(0, 10),
          }
        : null,
    },
  })
  return ok({ id: row.id })
}
