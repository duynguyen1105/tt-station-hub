'use client'

import { ListFilter, Search } from 'lucide-react'

import { useMemo, useState } from 'react'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { CustomerForm } from '@/components/debts/customer-form'
import { DebtOpeningForm } from '@/components/debts/debt-opening-form'
import { FilterChip } from '@/components/shared/filter-chip'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  type DebtCustomerFilter,
  filterDebtCustomers,
  hasDebtCustomerFilter,
} from '@/lib/debts/customer-search'
import type { DebtDay } from '@/lib/debts/ledger'
import { formatVND } from '@/lib/format'
import { vi } from '@/messages/vi'

/** A khách hàng as the Công nợ table prints them: their sổ on the chosen day. */
export type DebtCustomerRow = {
  id: string
  name: string
  phone: string | null
  misaCode: string | null
  knownPlates: string[]
  /** Nợ cuối ngày (0 before nợ đầu kỳ) — what "Chỉ khách còn nợ" reads. */
  balance: number
  /** Null for a day before the khách's nợ đầu kỳ. */
  day: DebtDay | null
  /** Lượt xe of the day not yet Duyệt'd, so not yet in Bán nợ. */
  pending: { count: number; amount: number }
  /** Nợ đầu kỳ as stored, for DebtOpeningForm. */
  opening: { balance: number; date: string | null }
}

const num = 'p-2 text-right font-mono whitespace-nowrap'

/**
 * The Công nợ list of a trạm, and the bộ lọc that narrows it.
 *
 * The bộ lọc and the table are one component because they are one decision: the
 * table renders whatever the box is holding, and there is nothing to lift or share.
 *
 * The narrowing happens here rather than on the server — unlike Báo cáo MISA and
 * Hàng tồn, which page over thousands of rows and must. This page already holds
 * every khách hàng of the trạm, so going back to the server for a list it is
 * sitting on would be slower than the search it was asked for, and would put a
 * round trip behind every keystroke.
 *
 * The URL is still kept in step, through `history.replaceState` rather than the
 * router: a filtered view survives a refresh and can be sent to a colleague, at no
 * round trip, and `replace` keeps Trở lại meaning the previous screen rather than
 * the previous keystroke.
 */
export function CustomerList({
  customers,
  initialFilter,
  canEdit,
  canEditOpening,
  today,
  unassignedPending,
}: {
  customers: DebtCustomerRow[]
  initialFilter: DebtCustomerFilter
  /** Thêm / Sửa khách hàng: false for người xem. */
  canEdit: boolean
  canEditOpening: boolean
  today: string
  unassignedPending: number
}) {
  const pathname = usePathname()
  const [filter, setFilter] = useState(initialFilter)
  const shown = useMemo(() => filterDebtCustomers(customers, filter), [customers, filter])
  const total = useMemo(() => {
    const sum = { opening: 0, charged: 0, paid: 0, closing: 0 }
    for (const c of shown) {
      if (!c.day) continue
      sum.opening += c.day.opening
      sum.charged += c.day.charged
      sum.paid += c.day.paid
      sum.closing += c.day.closing
    }
    return sum
  }, [shown])

  // The one way the filter changes: state and URL move together, so what is on
  // screen and what the address bar claims can't drift apart.
  function apply(next: DebtCustomerFilter) {
    setFilter(next)
    // Keeps every other param — the chosen day above all.
    const params = new URLSearchParams(window.location.search)
    params.delete('q')
    params.delete('owing')
    if (next.q) params.set('q', next.q)
    if (next.owing) params.set('owing', '1')
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname)
  }

  // Held untrimmed while typing — trimming mid-word would eat the space between a
  // first and a last name. What is matched is trimmed on the way in instead.
  const [typed, setTyped] = useState(initialFilter.q ?? '')

  function search(value: string) {
    setTyped(value)
    const q = value.trim()
    apply({ owing: filter.owing, ...(q ? { q } : {}) })
  }

  function clearSearch() {
    setTyped('')
    apply({ owing: filter.owing })
  }

  function clearAll() {
    setTyped('')
    apply({ owing: false })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            type="search"
            value={typed}
            onChange={(e) => search(e.target.value)}
            placeholder={vi.debts.searchPlaceholder}
            aria-label={vi.debts.searchPlaceholder}
            className="pl-8"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label={vi.common.filterMenu}
            >
              <ListFilter />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuCheckboxItem
              checked={!filter.owing}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => {
                if (filter.owing) apply({ ...filter, owing: false })
              }}
            >
              {vi.common.filterAll}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={filter.owing}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(ticked) => apply({ ...filter, owing: ticked === true })}
            >
              {vi.debts.onlyOwing}
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {filter.q ? (
          <FilterChip label={filter.q} removeLabel={vi.debts.clearSearch} onRemove={clearSearch} />
        ) : null}
        {filter.owing ? (
          <FilterChip
            label={vi.debts.onlyOwing}
            removeLabel={vi.debts.clearOwing}
            onRemove={() => apply({ ...filter, owing: false })}
          />
        ) : null}
        {hasDebtCustomerFilter(filter) ? (
          <Button type="button" size="sm" variant="ghost" onClick={clearAll}>
            {vi.common.clearFilter}
          </Button>
        ) : null}
      </div>
      {shown.length === 0 ? (
        <p className="text-muted-foreground text-sm">{vi.debts.emptyFiltered}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th className="p-2">{vi.debts.customer}</th>
              <th className="p-2">{vi.debts.misaCode}</th>
              <th className={num}>{vi.debts.openingOfDay}</th>
              <th className={num}>{vi.debts.chargedOfDay}</th>
              <th className={num}>{vi.debts.paidOfDay}</th>
              <th className={num}>{vi.debts.closingOfDay}</th>
              <th className={num}>{vi.debts.pendingOfDay}</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((customer) => (
              <tr key={customer.id} className="border-b">
                <td className="p-2">
                  <Link
                    href={`${pathname}/${customer.id}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {customer.name}
                  </Link>
                  {customer.phone || customer.knownPlates.length ? (
                    <div className="text-muted-foreground text-xs">
                      {[customer.phone, customer.knownPlates.join(', ')]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  ) : null}
                </td>
                <td className="p-2 font-mono">
                  {customer.misaCode ?? (
                    <StatusBadge label={vi.debtReview.missingCode} tone="danger" />
                  )}
                </td>
                {customer.day ? (
                  <>
                    <td className={num}>{formatVND(customer.day.opening)}</td>
                    <td className={num}>
                      {formatVND(customer.day.charged)}
                      {customer.day.chargeCount > 0 ? (
                        <div className="text-muted-foreground text-xs">
                          {vi.debts.visitsCount(customer.day.chargeCount)}
                        </div>
                      ) : null}
                    </td>
                    <td className={num}>{formatVND(customer.day.paid)}</td>
                    <td className={`${num} font-semibold`}>{formatVND(customer.day.closing)}</td>
                  </>
                ) : (
                  <>
                    <td className={num} title={vi.debts.beforeOpening}>
                      —
                    </td>
                    <td className={num}>—</td>
                    <td className={num}>—</td>
                    <td className={num}>—</td>
                  </>
                )}
                <td className={`${num} text-muted-foreground text-xs`}>
                  {customer.pending.count > 0
                    ? `${vi.debts.visitsCount(customer.pending.count)} · ${formatVND(customer.pending.amount)}`
                    : '—'}
                </td>
                <td className="p-2 text-right whitespace-nowrap">
                  {canEdit ? (
                    <CustomerForm
                      customer={{
                        id: customer.id,
                        name: customer.name,
                        phone: customer.phone,
                        misaCode: customer.misaCode,
                        knownPlates: customer.knownPlates,
                      }}
                      trigger={
                        <Button size="sm" variant="ghost">
                          {vi.common.edit}
                        </Button>
                      }
                    />
                  ) : null}
                  {canEditOpening ? (
                    <DebtOpeningForm
                      customerId={customer.id}
                      customerName={customer.name}
                      openingBalance={customer.opening.balance}
                      openingDate={customer.opening.date}
                      today={today}
                    />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="p-2" colSpan={2}>
                {vi.debts.total}
              </td>
              <td className={num}>{formatVND(total.opening)}</td>
              <td className={num}>{formatVND(total.charged)}</td>
              <td className={num}>{formatVND(total.paid)}</td>
              <td className={num}>{formatVND(total.closing)}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      )}
      {unassignedPending > 0 ? (
        <p className="text-muted-foreground text-sm">
          {vi.debts.unassignedPending(unassignedPending)}{' '}
          <Link href="/review/debts" className="underline-offset-2 hover:underline">
            {vi.debts.goReview}
          </Link>
        </p>
      ) : null}
    </div>
  )
}
