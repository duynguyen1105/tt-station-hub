import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PaymentForm } from '@/components/debts/payment-form'
import { requireStationAccess } from '@/lib/auth/station-guard'
import { formatDate, formatLiters, formatVND } from '@/lib/format'
import { fuelTypeLabeller } from '@/lib/fuels/load-catalogue'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

/**
 * One khách hàng's sổ công nợ: every charge and payment in the order it
 * happened, with the balance after each — the per-day detail the Công nợ tab's
 * single Dư nợ figure hides. A charge row says which lượt xe it came from
 * (biển số, lít × đơn giá) so a disputed line can be traced to its photos.
 */
export default async function CustomerLedgerPage({
  params,
}: {
  params: Promise<{ id: string; customerId: string }>
}) {
  const { id: stationId, customerId } = await params
  await requireStationAccess(stationId)

  const customer = await prisma.debtCustomer.findUnique({ where: { id: customerId } })
  if (!customer || customer.stationId !== stationId) notFound()

  const [txs, fuelLabel] = await Promise.all([
    prisma.debtTransaction.findMany({
      where: { customerId },
      orderBy: [{ txDate: 'asc' }, { createdAt: 'asc' }],
    }),
    fuelTypeLabeller(),
  ])
  const visitIds = txs.flatMap((tx) =>
    tx.txType === 'charge' && tx.sourceRef ? [tx.sourceRef] : []
  )
  const visits = new Map(
    (
      await prisma.debtVehicleVisit.findMany({
        where: { id: { in: visitIds } },
        select: {
          id: true,
          plateRead: true,
          plateConfirmed: true,
          litersRead: true,
          unitPriceRead: true,
          fuelType: true,
        },
      })
    ).map((v) => [v.id, v])
  )

  const opening = Number(customer.openingBalance)
  const rows: {
    id: string
    date: Date
    charge: boolean
    amount: number
    detail: string
    balance: number
  }[] = []
  for (const tx of txs) {
    const amount = Number(tx.amount)
    const charge = tx.txType === 'charge'
    const previous = rows.length ? rows[rows.length - 1]!.balance : opening
    const visit = tx.sourceRef ? visits.get(tx.sourceRef) : undefined
    const plate = visit?.plateConfirmed ?? visit?.plateRead
    const detail = visit
      ? [
          plate,
          visit.fuelType ? fuelLabel(visit.fuelType) : null,
          visit.litersRead !== null && visit.unitPriceRead !== null
            ? `${formatLiters(Number(visit.litersRead))} × ${formatVND(Number(visit.unitPriceRead))}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : (tx.note ?? '')
    rows.push({
      id: tx.id,
      date: tx.txDate,
      charge,
      amount,
      detail,
      balance: previous + (charge ? amount : -amount),
    })
  }
  const cell = 'p-2 text-right font-mono'

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href={`/stations/${stationId}/debts`}
            className="text-muted-foreground text-xs underline-offset-2 hover:underline"
          >
            ← {vi.debts.title}
          </Link>
          <h2 className="text-lg font-semibold">{customer.name}</h2>
          <p className="text-muted-foreground font-mono text-xs">
            {[customer.misaCode, ...customer.knownPlates].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-muted-foreground text-xs">{vi.debts.balance}</div>
          <div className="font-mono text-lg font-semibold">
            {formatVND(Number(customer.currentBalance))}
          </div>
          <PaymentForm customerId={customer.id} customerName={customer.name} />
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left">
            <th className="p-2">{vi.debts.ledgerDate}</th>
            <th className="p-2">{vi.debts.ledgerDetail}</th>
            <th className={cell}>{vi.debts.ledgerCharge}</th>
            <th className={cell}>{vi.debts.ledgerPayment}</th>
            <th className={cell}>{vi.debts.balance}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="text-muted-foreground border-b">
            <td className="p-2">—</td>
            <td className="p-2">{vi.debts.openingBalance}</td>
            <td className={cell}></td>
            <td className={cell}></td>
            <td className={cell}>{formatVND(opening)}</td>
          </tr>
          {rows.map((row) => (
            <tr key={row.id} className="border-b">
              <td className="p-2 whitespace-nowrap">{formatDate(row.date)}</td>
              <td className="p-2">
                <span className="font-medium">
                  {row.charge ? vi.debts.ledgerSale : vi.debts.payment}
                </span>
                {row.detail ? <span className="text-muted-foreground"> · {row.detail}</span> : null}
              </td>
              <td className={cell}>{row.charge ? formatVND(row.amount) : ''}</td>
              <td className={cell}>{row.charge ? '' : formatVND(row.amount)}</td>
              <td className={cell}>{formatVND(row.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{vi.debts.ledgerEmpty}</p>
      ) : null}
    </div>
  )
}
