import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { canEditCashEntries } from '@/lib/auth/reading-policy'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { prisma } from '@/lib/prisma'
import {
  cashPaymentRef,
  debtPaymentsOf,
  normalizeCashEntries,
  refuseCashEntries,
} from '@/lib/shifts/cash-entries'
import { vi } from '@/messages/vi'

const entrySchema = z.object({
  content: z.string().max(500),
  customerId: z.string().uuid().nullable(),
  counterparty: z.string().max(500),
  receipt: z.string().max(30),
  payment: z.string().max(30),
})

const cashEntriesSchema = z.object({
  entries: z.array(entrySchema).max(100),
})

/**
 * Saves a ca's Thu chi tiền mặt – Khách CK table: the whole table as it stands on screen
 * replaces what was stored, in order, blank rows dropped. What an amount may be is
 * refuseCashEntries's to decide, the same rule the table applies before posting.
 *
 * The ca's thu nợ is rewritten with it: a Thu row naming a khách hàng is a payment in
 * that khách's sổ công nợ, dated the ca's day, so emptying the table removes them.
 *
 * Admin and accountant at any status — `canEditCashEntries`. Chốt ca does not lock them.
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
  // Đối tượng names a khách hàng by id: every one must exist, or the row would point at
  // nobody. Existence only — a row saved before its khách was retired still re-saves.
  const customerIds = [...new Set(entries.flatMap((e) => (e.customerId ? [e.customerId] : [])))]
  if (customerIds.length > 0) {
    const found = await prisma.debtCustomer.count({ where: { id: { in: customerIds } } })
    if (found !== customerIds.length) return badRequest(vi.shifts.cashEntries.unknownCustomer)
  }
  await prisma.$transaction(async (tx) => {
    await tx.shiftCashEntry.deleteMany({ where: { shiftId: id } })
    await tx.shiftCashEntry.createMany({
      data: entries.map((entry, position) => ({ ...entry, shiftId: id, position })),
    })
    const payments = debtPaymentsOf(entries)
    await tx.debtTransaction.deleteMany({ where: { sourceRef: cashPaymentRef(id) } })
    if (payments.length > 0) {
      await tx.debtTransaction.createMany({
        data: payments.map((p) => ({
          customerId: p.customerId,
          txType: 'payment',
          amount: p.amount,
          sourceRef: cashPaymentRef(id),
          txDate: shift.shiftDate,
          note: p.note,
          createdBy: user.id,
        })),
      })
    }
    await writeAudit(
      {
        userId: user.id,
        action: 'shift.cash_entries.set',
        entity: 'shift',
        entityId: id,
        metadata: { entries, payments },
      },
      tx
    )
  })
  return ok({ count: entries.length })
}
