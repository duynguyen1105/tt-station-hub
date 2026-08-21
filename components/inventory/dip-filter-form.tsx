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
import { hasDipFilter } from '@/lib/inventory/dip-selection'
import { vi } from '@/messages/vi'

/** The tab this bộ lọc belongs to; every URL it pushes has to land back on it. */
const TAB = 'do-bon'

/** One thing that may be ticked: what goes in the URL, and what kế toán reads. */
export type DipFilterOption = { value: string; label: string }

/** The three multi-select criteria, each held as the values ticked. */
type Picks = { tanks: string[]; fuels: string[]; statuses: string[] }

/**
 * The bộ lọc as the screen holds it: what is in the URL, plus the preset those two ngày
 * happen to be. The preset is carried rather than worked out while rendering, because
 * working it out needs the clock — and a clock read during render is a clock the server and
 * the browser can disagree about either side of midnight.
 */
type AppliedFilter = DateFilter & Picks

/**
 * What a criterion's chip and its submenu's summary say. One pick is worth naming — it is
 * the cut kế toán makes most often and the name is what they are looking for. Several is a
 * count: the names would not fit, and the submenu is one click away for anyone who wants
 * them.
 */
function picksLabel(
  picks: string[],
  options: DipFilterOption[],
  all: string,
  count: (n: number) => string
): string {
  if (picks.length === 0) return all
  if (picks.length === 1) {
    const only = options.find((option) => option.value === picks[0])
    if (only) return only.label
  }
  return count(picks.length)
}

/**
 * Which đo hầm kế toán is looking at: the hầm, the nhiên liệu, the trạng thái, and the
 * khoảng ngày the dip-stick was photographed over.
 *
 * A single icon opening a menu of criteria, rather than a row of controls: the bộ lọc is
 * reached now and then and the history is what the screen is for, so the criteria stay
 * folded away until asked for. What *is* applied never hides — it reads as a chip beside
 * the icon, and each chip drops its own criterion without touching the others.
 *
 * The filter lives in the URL, so a filtered view survives a refresh and can be sent to a
 * colleague. Every pick applies straight away through the router: there is no Lọc button to
 * remember, and `useOptimistic` ticks the box on the click rather than a round-trip later,
 * so the menu can be worked down at the speed it is read.
 *
 * Ticking none of a criterion means tất cả — including trạng thái, so the unfiltered table
 * still lists a từ chối read, badged. This history is the audit trail of what was decided,
 * and narrowing it is something kế toán asks for rather than something it does by default.
 *
 * Every URL this pushes carries the tab, including the one Xóa bộ lọc pushes: the bare path
 * is Tổng quan, and clearing a filter must not move kế toán off the list they are reading.
 * The page is always dropped, since a different filter makes page 3 meaningless.
 */
export function DipFilterForm({
  from,
  to,
  tanks,
  fuels,
  statuses,
  tankOptions,
  fuelOptions,
  statusOptions,
  activePreset,
}: {
  from?: string
  to?: string
  tanks: string[]
  fuels: string[]
  statuses: string[]
  tankOptions: DipFilterOption[]
  fuelOptions: DipFilterOption[]
  statusOptions: DipFilterOption[]
  activePreset?: DatePreset
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isClearing, startClearing] = useTransition()
  // What the menu shows while the table behind it is still catching up. It falls back to the
  // filter the server applied the moment the new rows commit, so a pick the server refused —
  // a hầm this trạm doesn't have — un-ticks itself.
  const [shown, showOptimistic] = useOptimistic<AppliedFilter>({
    from,
    to,
    tanks,
    fuels,
    statuses,
    preset: activePreset,
  })

  function push(next: AppliedFilter, start: React.TransitionStartFunction) {
    const params = new URLSearchParams({ tab: TAB })
    // Empty criteria are dropped so clearing one takes it out of the URL instead of
    // leaving `?from=` behind.
    if (next.from) params.set('from', next.from)
    if (next.to) params.set('to', next.to)
    if (next.tanks.length) params.set('tank', next.tanks.join(','))
    if (next.fuels.length) params.set('fuel', next.fuels.join(','))
    if (next.statuses.length) params.set('status', next.statuses.join(','))
    start(() => {
      showOptimistic(next)
      router.push(`${pathname}?${params}`)
    })
  }

  // Ticking a value rebuilds the list from what is on offer rather than appending to it, so
  // what goes in the URL is in one settled order however it was clicked — the same order
  // the server reads it back in.
  function toggle(key: keyof Picks, options: DipFilterOption[], value: string, ticked: boolean) {
    const next = options
      .filter((option) => (option.value === value ? ticked : shown[key].includes(option.value)))
      .map((option) => option.value)
    push({ ...shown, [key]: next }, startTransition)
  }

  function clearPicks(key: keyof Picks) {
    push({ ...shown, [key]: [] }, startTransition)
  }

  // A preset fills the same two ngày kế toán could have typed, and is ticked from here on
  // because these are the two ngày it stands for.
  function applyPreset(preset: DatePreset) {
    const range = datePresetRange(preset, new Date())
    push({ ...shown, from: range.from, to: range.to, preset }, startTransition)
  }

  // A ngày typed by hand may land on a preset's range, and then it is that preset. The clock
  // is read here, in the click, and never while rendering.
  function setDay(edge: 'from' | 'to', value: string) {
    const next = { ...shown, [edge]: value || undefined }
    push({ ...next, preset: matchingDatePreset(next.from, next.to, new Date()) }, startTransition)
  }

  function clearDates() {
    push({ ...shown, from: undefined, to: undefined, preset: undefined }, startTransition)
  }

  // Back to the whole history in one action — every criterion and the page at once.
  function onClear() {
    push({ tanks: [], fuels: [], statuses: [] }, startClearing)
  }

  // The three multi-selects differ only in their strings, so they are described once and
  // rendered in a loop rather than written out three times.
  const criteria = [
    {
      key: 'tanks' as const,
      name: vi.inventory.tank,
      options: tankOptions,
      all: vi.inventory.allTanks,
      count: vi.inventory.tankCount,
      removeLabel: vi.inventory.clearTankFilter,
    },
    {
      key: 'fuels' as const,
      name: vi.inventory.fuelType,
      options: fuelOptions,
      all: vi.inventory.allFuels,
      count: vi.inventory.fuelCount,
      removeLabel: vi.inventory.clearFuelFilter,
    },
    {
      key: 'statuses' as const,
      name: vi.inventory.status,
      options: statusOptions,
      all: vi.inventory.allStatuses,
      count: vi.inventory.statusCount,
      removeLabel: vi.inventory.clearStatusFilter,
    },
  ]

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
          {criteria.map(({ key, name, options, all, count }) => (
            <DropdownMenuSub key={key}>
              <DropdownMenuSubTrigger>
                <span className="flex-1">{name}</span>
                <span className="text-muted-foreground ml-2 truncate text-xs">
                  {picksLabel(shown[key], options, all, count)}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
                  <DropdownMenuCheckboxItem
                    checked={shown[key].length === 0}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => {
                      if (shown[key].length) clearPicks(key)
                    }}
                  >
                    {all}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  {options.map((option) => (
                    <DropdownMenuCheckboxItem
                      key={option.value}
                      checked={shown[key].includes(option.value)}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={(ticked) =>
                        toggle(key, options, option.value, ticked === true)
                      }
                    >
                      {option.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          ))}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span className="flex-1">{vi.inventory.dipMeasuredDate}</span>
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
      {criteria.map(({ key, options, all, count, removeLabel }) =>
        shown[key].length > 0 ? (
          <FilterChip
            key={key}
            label={picksLabel(shown[key], options, all, count)}
            removeLabel={removeLabel}
            onRemove={() => clearPicks(key)}
          />
        ) : null
      )}
      {noDates ? null : (
        <FilterChip
          label={dateFilterLabel(shown)}
          removeLabel={vi.common.clearDateFilter}
          onRemove={clearDates}
        />
      )}
      {hasDipFilter(shown) ? (
        <Button type="button" size="sm" variant="ghost" loading={isClearing} onClick={onClear}>
          {vi.common.clearFilter}
        </Button>
      ) : null}
    </div>
  )
}
