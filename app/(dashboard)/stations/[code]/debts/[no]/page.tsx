import Link from 'next/link'
import { notFound } from 'next/navigation'

import { CustomerLedgerFilterForm } from '@/components/debts/customer-ledger-filter-form'
import { DebtOpeningForm } from '@/components/debts/debt-opening-form'
import { canEditOpening } from '@/lib/auth/reading-policy'
import { loadStationBySlug, requireStationAccess } from '@/lib/auth/station-guard'
import {
  type CustomerLedgerParams,
  type LedgerKind,
  customerLedgerSelection,
  hasCustomerLedgerFilter,
} from '@/lib/debts/customer-ledger-selection'
import { dayKeyOf } from '@/lib/debts/ledger'
import { todayKey } from '@/lib/debts/load-ledger'
import { matchingDatePreset } from '@/lib/filters/date-presets'
import { formatDate, formatLiters, formatVND } from '@/lib/format'
import { fuelTypeLabeller } from '@/lib/fuels/load-catalogue'
import { prisma } from '@/lib/prisma'
import { CASH_PAYMENT_REF_PREFIX } from '@/lib/shifts/cash-entries'
import { shiftHref, stationHref } from '@/lib/stations/href'
import { vi } from '@/messages/vi'

/**
 * One khách hàng's sổ công nợ: nợ đầu kỳ, then every charge and payment from its day
 * on in the order it happened, with the balance after each. A charge row says which
 * lượt xe it came from (biển số, lít × đơn giá) so a disputed line can be traced to
 * its photos; a thu nợ row links the ca whose Thu chi table recorded it.
 *
 * The bộ lọc (ngày, loại giao dịch, biển số) narrows the finished chain, so every line
 * still shows the true Dư nợ after it — see `customerLedgerSelection`.
 */
export default async function CustomerLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string; no: string }>
  searchParams: Promise<CustomerLedgerParams>
}) {
  const { code, no } = await params
  const { id: stationId } = await loadStationBySlug(code)
  const user = await requireStationAccess(stationId)

  // Named by its số within this trạm, so another trạm's khách can't be reached here.
  if (!/^\d+$/.test(no)) notFound()
  const customer = await prisma.debtCustomer.findUnique({
    where: { stationId_no: { stationId, no: Number(no) } },
  })
  if (!customer) notFound()
  const customerId = customer.id

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
  // A charge's sourceRef is its lượt xe — unless it came from a ca's Thu chi (a tạm ứng).
  const visitIds = txs.flatMap((tx) =>
    tx.txType === 'charge' && tx.sourceRef && !tx.sourceRef.startsWith(CASH_PAYMENT_REF_PREFIX)
      ? [tx.sourceRef]
      : []
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
        select: { id: true, shiftDate: true },
      })
    ).map((s) => [s.id, s])
  )

  const opening = Number(customer.openingBalance)
  const rows: {
    id: string
    date: string
    txDate: Date
    kind: LedgerKind
    plate: string | null
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
      date: dayKeyOf(tx.txDate),
      txDate: tx.txDate,
      kind: !charge ? 'payment' : shift ? 'advance' : 'sale',
      plate: plate ?? null,
      charge,
      amount,
      detail,
      shiftHref: shift ? shiftHref(code, shift.shiftDate) : null,
      shiftLabel: shift ? vi.debts.fromCashEntries(formatDate(shift.shiftDate)) : null,
      balance: previous + (charge ? amount : -amount),
    })
  }
  const balance = rows.length ? rows[rows.length - 1]!.balance : opening
  const sel = customerLedgerSelection(await searchParams, opening, rows)
  const activePreset = matchingDatePreset(sel.from, sel.to, new Date())
  const openingDate = customer.openingDate ? dayKeyOf(customer.openingDate) : null
  const cell = 'p-2 text-right font-mono'

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href={`${stationHref(code)}/debts`}
            className="text-muted-foreground text-xs underline-offset-2 hover:underline"
          >
            ← {vi.stationTabs.debts}
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

      <CustomerLedgerFilterForm
        from={sel.from}
        to={sel.to}
        types={sel.types}
        plates={sel.plates}
        plateOptions={sel.plateOptions}
        activePreset={activePreset}
      />

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
              {sel.from
                ? vi.debts.balanceBefore(sel.from.split('-').reverse().join('/'))
                : customer.openingDate
                  ? `${vi.debts.openingBalance} (${formatDate(customer.openingDate)})`
                  : vi.debts.openingBalance}
            </td>
            <td className={cell}></td>
            <td className={cell}></td>
            <td className={cell}>{formatVND(sel.openingOfRange)}</td>
          </tr>
          {sel.rows.map((row) => (
            <tr key={row.id} className="border-b">
              <td className="p-2 whitespace-nowrap">{formatDate(row.txDate)}</td>
              <td className="p-2">
                <span className="font-medium">
                  {row.charge
                    ? row.shiftHref
                      ? vi.debts.ledgerAdvance
                      : vi.debts.ledgerSale
                    : vi.debts.payment}
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
        {sel.rows.length ? (
          <tfoot>
            <tr className="font-semibold">
              <td className="p-2"></td>
              <td className="p-2">{vi.debts.total}</td>
              <td className={cell}>{formatVND(sel.totals.charge)}</td>
              <td className={cell}>{formatVND(sel.totals.payment)}</td>
              <td className={cell}>{formatVND(sel.closingOfRange)}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
      {sel.rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {hasCustomerLedgerFilter(sel) ? vi.debts.ledgerEmptyFiltered : vi.debts.ledgerEmpty}
        </p>
      ) : null}
    </div>
  )
}
