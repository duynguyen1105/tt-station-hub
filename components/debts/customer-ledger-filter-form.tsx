'use client'

import { type FilterCriterion, FilterMenu } from '@/components/shared/filter-menu'
import type { LedgerKind } from '@/lib/debts/customer-ledger-selection'
import type { DatePreset } from '@/lib/filters/date-presets'
import { vi } from '@/messages/vi'

/** Each loại giao dịch named as the Nội dung column names it. */
const TYPE_OPTIONS: { value: LedgerKind; label: string }[] = [
  { value: 'sale', label: vi.debts.ledgerSale },
  { value: 'advance', label: vi.debts.ledgerAdvance },
  { value: 'payment', label: vi.debts.payment },
]

/**
 * The bộ lọc of one khách hàng's sổ công nợ: the khoảng ngày, the loại giao dịch, and
 * the biển số a Bán nợ came from — which xe ran up which nợ is the question a khách with
 * several xe asks first.
 *
 * Biển số is offered only when the sổ holds one; a khách who only ever paid would get
 * a submenu with nothing in it.
 */
export function CustomerLedgerFilterForm({
  from,
  to,
  types,
  plates,
  plateOptions,
  activePreset,
}: {
  from?: string
  to?: string
  types: LedgerKind[]
  plates: string[]
  plateOptions: string[]
  activePreset?: DatePreset
}) {
  const criteria: FilterCriterion[] = [
    {
      param: 'type',
      name: vi.debts.txType,
      options: TYPE_OPTIONS,
      picks: types,
      all: vi.debts.allTxTypes,
      count: vi.debts.txTypeCount,
      removeLabel: vi.debts.clearTxTypeFilter,
    },
  ]
  if (plateOptions.length) {
    criteria.push({
      param: 'plate',
      name: vi.debts.plate,
      options: plateOptions.map((plate) => ({ value: plate, label: plate })),
      picks: plates,
      all: vi.debts.allPlates,
      count: vi.debts.plateCount,
      removeLabel: vi.debts.clearPlateFilter,
    })
  }
  return (
    <FilterMenu
      from={from}
      to={to}
      activePreset={activePreset}
      dateName={vi.debts.ledgerDate}
      criteria={criteria}
    />
  )
}
