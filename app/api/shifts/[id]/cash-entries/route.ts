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
  debtChargesOf,
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
  chargesDebt: z.boolean().default(false),
  // Defaulted so a tab opened before the Chuyển khoản column shipped still saves.
  transfer: z.string().max(30).default(''),
  repaysDebt: z.boolean().default(false),
})

const cashEntriesSchema = z.object({
  entries: z.array(entrySchema).max(100),
})

/**
 * Saves a ca's Thu chi tiền mặt – Khách CK table: the whole table as it stands on screen
 * replaces what was stored, in order, blank rows dropped. What an amount may be is
 * refuseCashEntries's to decide, the same rule the table applies before posting.
 *
 * The ca's rows in the sổ công nợ are rewritten with it, dated the ca's day: a Thu row
 * naming a khách hàng is a payment by that khách, as is a Chuyển khoản naming one ticked
 * Trả nợ cũ; a Chi row naming one and ticked Ghi nợ (a tạm ứng) is a khoản nợ of theirs.
 * Emptying the table removes them.
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
    const charges = debtChargesOf(entries)
    await tx.debtTransaction.deleteMany({ where: { sourceRef: cashPaymentRef(id) } })
    const posted = [
      ...payments.map((p) => ({ ...p, txType: 'payment' })),
      ...charges.map((c) => ({ ...c, txType: 'charge' })),
    ]
    if (posted.length > 0) {
      await tx.debtTransaction.createMany({
        data: posted.map((p) => ({
          customerId: p.customerId,
          txType: p.txType,
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
        metadata: { entries, payments, charges },
      },
      tx
    )
  })
  return ok({ count: entries.length })
}
