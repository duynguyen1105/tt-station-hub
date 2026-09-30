import { type Prisma } from '@/lib/generated/prisma/client'

/**
 * The số the next khách hàng / biên bản of a trạm takes — one past its highest,
 * so it opens at `/stations/<mã>/debts/<số>` (see `href.ts`). Two made at the same
 * instant would draw the same số; the (trạm, số) unique index refuses the second
 * rather than letting two rows share an address.
 */
export async function nextCustomerNo(
  db: Prisma.TransactionClient,
  stationId: string
): Promise<number> {
  const { _max } = await db.debtCustomer.aggregate({ where: { stationId }, _max: { no: true } })
  return (_max.no ?? 0) + 1
}

export async function nextReceiptNo(
  db: Prisma.TransactionClient,
  stationId: string
): Promise<number> {
  const { _max } = await db.fuelImportReceipt.aggregate({
    where: { stationId },
    _max: { no: true },
  })
  return (_max.no ?? 0) + 1
}
