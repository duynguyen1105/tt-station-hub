import { CustomerForm } from '@/components/debts/customer-form'
import { CustomerList } from '@/components/debts/customer-list'
import { DebtDayHeader } from '@/components/debts/debt-day-header'
import { Button } from '@/components/ui/button'
import { canEditCashEntries } from '@/lib/auth/reading-policy'
import { requireStationAccess } from '@/lib/auth/station-guard'
import { debtCustomerFilter } from '@/lib/debts/customer-search'
import { debtDay } from '@/lib/debts/ledger'
import { loadLedgers, todayKey } from '@/lib/debts/load-ledger'
import { chargeAmountOf } from '@/lib/debts/visit-amount'
import { shiftDayWindow } from '@/lib/misa-export/debts-list'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

/**
 * The Công nợ tab: the sổ công nợ of one day, like chốt ca — per khách hàng Nợ đầu ngày,
 * + Bán nợ, − Thu, = Nợ cuối ngày, and the lượt xe of the day still waiting for Duyệt.
 */
export default async function StationDebtsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ q?: string; owing?: string; date?: string }>
}) {
  const { id } = await params
  const user = await requireStationAccess(id)
  const query = await searchParams
  const today = todayKey()
  const valid = query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) && query.date <= today
  const day = valid ? query.date! : today
  const dayDate = new Date(`${day}T00:00:00.000Z`)
  const { start, end } = shiftDayWindow(dayDate)

  const [ledgers, visits, shift] = await Promise.all([
    loadLedgers({ stationId: id, isActive: true }),
    // A charge exists only after Duyệt, so a corrected lượt xe is still uncharged.
    prisma.debtVehicleVisit.findMany({
      where: {
        stationId: id,
        reviewStatus: { in: ['pending', 'needs_review', 'corrected'] },
        visitDate: { gte: start, lt: end },
      },
      select: { customerId: true, litersRead: true, unitPriceRead: true, amountOverride: true },
    }),
    prisma.shift.findUnique({
      where: {
        stationId_shiftDate_shiftType: { stationId: id, shiftDate: dayDate, shiftType: 'full_day' },
      },
      select: { id: true },
    }),
  ])

  const pending = new Map<string, { count: number; amount: number }>()
  let unassignedPending = 0
  for (const v of visits) {
    if (!v.customerId) {
      unassignedPending++
      continue
    }
    const amount =
      chargeAmountOf({
        litersRead: v.litersRead !== null ? Number(v.litersRead) : null,
        unitPriceRead: v.unitPriceRead !== null ? Number(v.unitPriceRead) : null,
        amountOverride: v.amountOverride !== null ? Number(v.amountOverride) : null,
      }) ?? 0
    const sum = pending.get(v.customerId) ?? { count: 0, amount: 0 }
    pending.set(v.customerId, { count: sum.count + 1, amount: sum.amount + amount })
  }

  // Người xem reads the sổ; adding or editing a khách is left out for them.
  const canEdit = user.role !== 'viewer'
  const addButton = canEdit ? (
    <CustomerForm
      stationId={id}
      trigger={<Button size="sm">+ {vi.debtReview.addCustomer}</Button>}
    />
  ) : null

  // A trạm with no khách hàng at all has nothing to filter, so it keeps its own
  // empty state rather than reading as a bộ lọc that matched nothing.
  if (ledgers.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">{addButton}</div>
        <p className="text-muted-foreground text-sm">{vi.debts.empty}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DebtDayHeader
          stationId={id}
          day={day}
          today={today}
          shiftId={shift?.id ?? null}
          canOpenShift={canEditCashEntries(user.role)}
        />
        {addButton}
      </div>
      <CustomerList
        customers={ledgers.map(({ customer, txs }) => {
          const ofDay = debtDay(customer.anchor, txs, day)
          return {
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            misaCode: customer.misaCode,
            knownPlates: customer.knownPlates,
            balance: ofDay?.closing ?? 0,
            day: ofDay,
            pending: pending.get(customer.id) ?? { count: 0, amount: 0 },
            opening: {
              balance: customer.anchor.openingBalance,
              date: customer.anchor.openingDate,
            },
          }
        })}
        initialFilter={debtCustomerFilter(query)}
        canEdit={canEdit}
        canEditOpening={user.role === 'admin'}
        today={today}
        unassignedPending={unassignedPending}
      />
    </div>
  )
}
