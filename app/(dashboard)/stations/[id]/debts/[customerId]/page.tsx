import Link from 'next/link'
import { notFound } from 'next/navigation'

import { DebtOpeningForm } from '@/components/debts/debt-opening-form'
import { canEditOpening } from '@/lib/auth/reading-policy'
import { requireStationAccess } from '@/lib/auth/station-guard'
import { dayKeyOf } from '@/lib/debts/ledger'
import { todayKey } from '@/lib/debts/load-ledger'
import { formatDate, formatLiters, formatVND } from '@/lib/format'
import { fuelTypeLabeller } from '@/lib/fuels/load-catalogue'
import { prisma } from '@/lib/prisma'
import { CASH_PAYMENT_REF_PREFIX } from '@/lib/shifts/cash-entries'
import { vi } from '@/messages/vi'

/**
 * One khách hàng's sổ công nợ: nợ đầu kỳ, then every charge and payment from its day
 * on in the order it happened, with the balance after each. A charge row says which
 * lượt xe it came from (biển số, lít × đơn giá) so a disputed line can be traced to
 * its photos; a thu nợ row links the ca whose Thu chi table recorded it.
 */
export default async function CustomerLedgerPage({
  params,
}: {
  params: Promise<{ id: string; customerId: string }>
}) {
  const { id: stationId, customerId } = await params
  const user = await requireStationAccess(stationId)

  const customer = await prisma.debtCustomer.findUnique({ where: { id: customerId } })
  if (!customer || customer.stationId !== stationId) notFound()

  const [txs, fuelLabel] = await Promise.all([
    prisma.debtTransaction.findMany({
      // Transactions before the opening date are already inside nợ đầu kỳ.
      where: {
        customerId,
        ...(customer.openingDate ? { txDate: { gte: customer.openingDate } } : {}),
      },
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
  const shiftIds = txs.flatMap((tx) =>
    tx.sourceRef?.startsWith(CASH_PAYMENT_REF_PREFIX)
      ? [tx.sourceRef.slice(CASH_PAYMENT_REF_PREFIX.length)]
      : []
  )
  const shifts = new Map(
    (
      await prisma.shift.findMany({
        where: { id: { in: shiftIds } },
        select: { id: true, stationId: true, shiftDate: true },
      })
    ).map((s) => [s.id, s])
  )

  const opening = Number(customer.openingBalance)
  const rows: {
    id: string
    date: Date
    charge: boolean
    amount: number
    detail: string
    shiftHref: string | null
    shiftLabel: string | null
    balance: number
  }[] = []
  for (const tx of txs) {
    const amount = Number(tx.amount)
    const charge = tx.txType === 'charge'
    const previous = rows.length ? rows[rows.length - 1]!.balance : opening
    const visit = charge && tx.sourceRef ? visits.get(tx.sourceRef) : undefined
    const shift = tx.sourceRef?.startsWith(CASH_PAYMENT_REF_PREFIX)
      ? shifts.get(tx.sourceRef.slice(CASH_PAYMENT_REF_PREFIX.length))
      : undefined
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
      shiftHref: shift ? `/stations/${shift.stationId}/shifts/${shift.id}` : null,
      shiftLabel: shift ? vi.debts.fromCashEntries(formatDate(shift.shiftDate)) : null,
      balance: previous + (charge ? amount : -amount),
    })
  }
  const balance = rows.length ? rows[rows.length - 1]!.balance : opening
  const openingDate = customer.openingDate ? dayKeyOf(customer.openingDate) : null
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
          <div className="font-mono text-lg font-semibold">{formatVND(balance)}</div>
          {canEditOpening(user.role) ? (
            <DebtOpeningForm
              customerId={customer.id}
              customerName={customer.name}
              openingBalance={opening}
              openingDate={openingDate}
              today={todayKey()}
            />
          ) : null}
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
            <td className="p-2">
              {customer.openingDate
                ? `${vi.debts.openingBalance} (${formatDate(customer.openingDate)})`
                : vi.debts.openingBalance}
            </td>
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
                {row.shiftHref ? (
                  <>
                    <span className="text-muted-foreground"> · </span>
                    <Link href={row.shiftHref} className="underline-offset-2 hover:underline">
                      {row.shiftLabel}
                    </Link>
                  </>
                ) : null}
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
