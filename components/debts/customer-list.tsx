'use client'

import { ListFilter, Search } from 'lucide-react'

import { useMemo, useState } from 'react'

import { usePathname } from 'next/navigation'

import { CustomerForm } from '@/components/debts/customer-form'
import { PaymentForm } from '@/components/debts/payment-form'
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
import { formatVND } from '@/lib/format'
import { vi } from '@/messages/vi'

/** A khách hàng as the Công nợ table prints them — dư nợ already a number. */
export type DebtCustomerRow = {
  id: string
  name: string
  phone: string | null
  misaCode: string | null
  knownPlates: string[]
  balance: number
}

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
}: {
  customers: DebtCustomerRow[]
  initialFilter: DebtCustomerFilter
}) {
  const pathname = usePathname()
  const [filter, setFilter] = useState(initialFilter)
  const shown = useMemo(() => filterDebtCustomers(customers, filter), [customers, filter])

  // The one way the filter changes: state and URL move together, so what is on
  // screen and what the address bar claims can't drift apart.
  function apply(next: DebtCustomerFilter) {
    setFilter(next)
    const params = new URLSearchParams()
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
              <th className="p-2">{vi.debts.plate}</th>
              <th className="p-2">{vi.debts.misaCode}</th>
              <th className="p-2 text-right">{vi.debts.balance}</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((customer) => (
              <tr key={customer.id} className="border-b">
                <td className="p-2">
                  <div className="font-medium">{customer.name}</div>
                  {customer.phone ? (
                    <div className="text-muted-foreground text-xs">{customer.phone}</div>
                  ) : null}
                </td>
                <td className="p-2 font-mono text-xs">
                  {customer.knownPlates.length ? customer.knownPlates.join(', ') : '—'}
                </td>
                <td className="p-2 font-mono">
                  {customer.misaCode ?? (
                    <StatusBadge label={vi.debtReview.missingCode} tone="danger" />
                  )}
                </td>
                <td className="p-2 text-right font-mono">{formatVND(customer.balance)}</td>
                <td className="p-2 text-right whitespace-nowrap">
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
                  <PaymentForm customerId={customer.id} customerName={customer.name} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
