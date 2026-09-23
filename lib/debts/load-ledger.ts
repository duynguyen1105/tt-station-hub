import { type LedgerAnchor, type LedgerTx, dayKeyOf } from '@/lib/debts/ledger'
import type { Prisma } from '@/lib/generated/prisma/client'
import { shiftDateFor } from '@/lib/photos/ingest'
import { prisma } from '@/lib/prisma'

/** Today's GMT+7 day as YYYY-MM-DD. A function so pages stay clear of the purity lint. */
export function todayKey(): string {
  return dayKeyOf(shiftDateFor(Date.now()))
}

export type LedgerCustomer = {
  id: string
  name: string
  phone: string | null
  misaCode: string | null
  knownPlates: string[]
  stationId: string | null
  anchor: LedgerAnchor
}

/** The khách matching `where`, each with its sổ công nợ (oldest transaction first). */
export async function loadLedgers(
  where: Prisma.DebtCustomerWhereInput
): Promise<{ customer: LedgerCustomer; txs: LedgerTx[] }[]> {
  const customers = await prisma.debtCustomer.findMany({ where, orderBy: { name: 'asc' } })
  // ponytail: loads every transaction of these khách; switch to a SQL SUM when one trạm's sổ reaches tens of thousands of rows
  const txs = await prisma.debtTransaction.findMany({
    where: { customerId: { in: customers.map((c) => c.id) } },
    select: { customerId: true, txType: true, amount: true, txDate: true },
    orderBy: [{ txDate: 'asc' }, { createdAt: 'asc' }],
  })
  const byCustomer = new Map<string, LedgerTx[]>()
  for (const tx of txs) {
    const list = byCustomer.get(tx.customerId) ?? []
    list.push({
      txType: tx.txType === 'charge' ? 'charge' : 'payment',
      amount: Number(tx.amount),
      txDate: dayKeyOf(tx.txDate),
    })
    byCustomer.set(tx.customerId, list)
  }
  return customers.map((c) => ({
    customer: {
      id: c.id,
      name: c.name,
      phone: c.phone,
      misaCode: c.misaCode,
      knownPlates: c.knownPlates,
      stationId: c.stationId,
      anchor: {
        openingBalance: Number(c.openingBalance),
        openingDate: c.openingDate ? dayKeyOf(c.openingDate) : null,
      },
    },
    txs: byCustomer.get(c.id) ?? [],
  }))
}
