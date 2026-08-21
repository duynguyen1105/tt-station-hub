'use client'

import { ListFilter } from 'lucide-react'

import { useOptimistic, useTransition } from 'react'

import { usePathname, useRouter } from 'next/navigation'

import {
  type DateFilter,
  DateFilterItems,
  dateFilterLabel,
} from '@/components/shared/date-filter-items'
import { FilterChip } from '@/components/shared/filter-chip'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { type DatePreset, datePresetRange, matchingDatePreset } from '@/lib/filters/date-presets'
import { hasLedgerFilter } from '@/lib/inventory/ledger-selection'
import { vi } from '@/messages/vi'

/** The tab this bộ lọc belongs to; every URL it pushes has to land back on it. */
const TAB = 'so-sach'

/** One nhiên liệu on offer: the khóa the URL carries, and the tên kế toán reads. */
type FuelOption = { value: string; label: string }

/**
 * The bộ lọc as the screen holds it: what is in the URL, plus the preset those two ngày
 * happen to be. The preset is carried rather than worked out while rendering, because
 * working it out needs the clock — and a clock read during render is a clock the server
 * and the browser can disagree about either side of midnight.
 */
type AppliedFilter = DateFilter & { fuels: string[] }

/**
 * What the nhiên liệu chip says. One is worth naming — it is the cut kế toán makes most
 * often and the tên is what they are looking for. Several is a count: the tên would not
 * fit, and the submenu is one click away for anyone who wants them.
 */
function fuelLabel(fuels: string[], options: FuelOption[]): string {
  if (fuels.length === 0) return vi.inventory.allFuels
  if (fuels.length === 1) {
    const only = options.find((option) => option.value === fuels[0])
    if (only) return only.label
  }
  return vi.inventory.fuelCount(fuels.length)
}

/**
 * The khoảng ngày of sổ sách kế toán is reading, and the nhiên liệu they are reading it
 * for — over the ngày each lít actually moved.
 *
 * This is the Báo cáo MISA bộ lọc with nhiên liệu where trạm sits: this page is already
 * one trạm, and at a trạm selling four nhiên liệu a month of trading is six pages of
 * ngày × nhiên liệu with no way through it.
 *
 * The filter lives in the URL, so a filtered view survives a refresh and can be sent to
 * a colleague. Every pick applies straight away through the router: there is no Lọc
 * button to remember, and `useOptimistic` ticks the box on the click rather than a
 * round-trip later, so the menu can be worked down at the speed it is read.
 *
 * The nhiên liệu offered are the ones the sổ sách holds a ngày for, so every one of them
 * returns rows, and one Trường Thịnh has since stopped selling is still there while its
 * ngày are. Ticking none of them means tất cả nhiên liệu.
 *
 * Every URL this pushes carries the tab, including the one Xóa bộ lọc pushes: the bare
 * path is Tổng quan, and clearing a filter must not move kế toán off the sổ sách they
 * are reading. The page is always dropped, since a narrower filter makes page 3
 * meaningless.
 */
export function LedgerFilterForm({
  from,
  to,
  fuels,
  fuelOptions,
  activePreset,
}: {
  from?: string
  to?: string
  fuels: string[]
  fuelOptions: FuelOption[]
  activePreset?: DatePreset
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isClearing, startClearing] = useTransition()
  // What the menu shows while the sổ sách behind it is still catching up. It falls back
  // to the filter the server applied the moment the new rows commit, so a pick the
  // server ignored — a ngày that doesn't exist — un-ticks itself.
  const [shown, showOptimistic] = useOptimistic<AppliedFilter>({
    from,
    to,
    fuels,
    preset: activePreset,
  })

  function push(next: AppliedFilter, start: React.TransitionStartFunction) {
    const params = new URLSearchParams({ tab: TAB })
    // Empty values are dropped so clearing one takes it out of the URL instead of
    // leaving `?from=` behind.
    if (next.from) params.set('from', next.from)
    if (next.to) params.set('to', next.to)
    if (next.fuels.length) params.set('fuel', next.fuels.join(','))
    start(() => {
      showOptimistic(next)
      router.push(`${pathname}?${params}`)
    })
  }

  // Ticking a nhiên liệu rebuilds the list from the ones on offer rather than appending
  // to it, so what goes in the URL is in one settled order however it was clicked.
  function toggleFuel(value: string, ticked: boolean) {
    const next = fuelOptions
      .filter((option) => (option.value === value ? ticked : shown.fuels.includes(option.value)))
      .map((option) => option.value)
    push({ ...shown, fuels: next }, startTransition)
  }

  // A preset fills the same two ngày kế toán could have typed, and is ticked from here
  // on because these are the two ngày it stands for.
  function applyPreset(preset: DatePreset) {
    const range = datePresetRange(preset, new Date())
    push({ ...shown, from: range.from, to: range.to, preset }, startTransition)
  }

  // A ngày typed by hand may land on a preset's range, and then it is that preset. The
  // clock is read here, in the click, and never while rendering.
  function setDay(edge: 'from' | 'to', value: string) {
    const next = { ...shown, [edge]: value || undefined }
    push({ ...next, preset: matchingDatePreset(next.from, next.to, new Date()) }, startTransition)
  }

  function clearDates() {
    push({ ...shown, from: undefined, to: undefined, preset: undefined }, startTransition)
  }

  function clearFuels() {
    push({ ...shown, fuels: [] }, startTransition)
  }

  const noDates = !shown.from && !shown.to

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={isPending}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="icon-sm" variant="outline" aria-label={vi.common.filterMenu}>
            <ListFilter />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-60">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span className="flex-1">{vi.inventory.fuelType}</span>
              <span className="text-muted-foreground ml-2 truncate text-xs">
                {fuelLabel(shown.fuels, fuelOptions)}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
                <DropdownMenuCheckboxItem
                  checked={shown.fuels.length === 0}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => {
                    if (shown.fuels.length) clearFuels()
                  }}
                >
                  {vi.inventory.allFuels}
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                {fuelOptions.map((option) => (
                  <DropdownMenuCheckboxItem
                    key={option.value}
                    checked={shown.fuels.includes(option.value)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(ticked) => toggleFuel(option.value, ticked === true)}
                  >
                    {option.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span className="flex-1">{vi.inventory.date}</span>
              <span className="text-muted-foreground ml-2 truncate text-xs">
                {dateFilterLabel(shown)}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-60">
                <DateFilterItems
                  filter={shown}
                  onPreset={applyPreset}
                  onClearDates={clearDates}
                  onDay={setDay}
                />
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
      {shown.fuels.length > 0 ? (
        <FilterChip
          label={fuelLabel(shown.fuels, fuelOptions)}
          removeLabel={vi.inventory.clearFuelFilter}
          onRemove={clearFuels}
        />
      ) : null}
      {noDates ? null : (
        <FilterChip
          label={dateFilterLabel(shown)}
          removeLabel={vi.common.clearDateFilter}
          onRemove={clearDates}
        />
      )}
      {hasLedgerFilter(shown) ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          loading={isClearing}
          onClick={() => push({ fuels: [] }, startClearing)}
        >
          {vi.common.clearFilter}
        </Button>
      ) : null}
    </div>
  )
}
