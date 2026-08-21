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
import { filterQuery } from '@/lib/filters/params'
import { vi } from '@/messages/vi'

/** One thing that may be ticked: what goes in the URL, and what kế toán reads. */
export type FilterOption = { value: string; label: string }

/** One criterion the menu offers: a submenu to pick it, and a chip once anything is. */
export type FilterCriterion = {
  /**
   * The URL parameter it rides in, comma-joined. It doubles as the criterion's React key
   * and as the key it is held under, which nothing else can be: one parameter is one
   * criterion, or the two would overwrite each other in the link.
   */
  param: string
  /** What the submenu row is called: Hầm, Nhiên liệu, Trạng thái, Trạm. */
  name: string
  /** Everything on offer, in the order the server narrows the URL against. */
  options: FilterOption[]
  /** What is ticked, as the server applied it. */
  picks: string[]
  /** What none ticked reads as — "Tất cả hầm" rather than a bare "Tất cả". */
  all: string
  /** What several ticked read as. */
  count: (n: number) => string
  /** The chip's remove button, for a screen reader. */
  removeLabel: string
}

/**
 * The bộ lọc as the screen holds it: what is in the URL, plus the preset those two ngày
 * happen to be. The preset is carried rather than worked out while rendering, because
 * working it out needs the clock — and a clock read during render is a clock the server and
 * the browser can disagree about either side of midnight.
 */
type AppliedFilter = DateFilter & { picks: Record<string, string[]> }

/**
 * What a criterion's chip and its submenu's summary say. One pick is worth naming — it is
 * the cut kế toán makes most often and the name is what they are looking for. Several is a
 * count: the names would not fit, and the submenu is one click away for anyone who wants
 * them.
 */
function picksLabel(picks: string[], criterion: FilterCriterion): string {
  if (picks.length === 0) return criterion.all
  if (picks.length === 1) {
    const only = criterion.options.find((option) => option.value === picks[0])
    if (only) return only.label
  }
  return criterion.count(picks.length)
}

/**
 * The bộ lọc every filtered screen in the app wears: Chốt ca, Báo cáo MISA, and the ba tab
 * of Hàng tồn.
 *
 * A bộ lọc reached now and then would crowd out the list that the screen is actually for,
 * so the criteria stay folded behind an icon. What *is* applied never hides — it reads as a
 * chip beside the icon, and each chip drops its own criterion without touching the others.
 *
 * The URL is the only record of what is on screen. Nothing is held here that the link does
 * not say, so a filtered screen can be sent to someone else, kept in a tab, or reloaded and
 * come back the same — and the server, which does the actual narrowing, always agrees with
 * the menu because it read the same link.
 *
 * Ticking none of a criterion means tất cả. A screen narrows because kế toán asked it to,
 * never by default.
 *
 * Each screen supplies its own criteria: what they are called, which parameter each rides
 * in, and what "tất cả" and a count read like for them. That is everything that ever
 * differed between the five copies this replaces.
 */
export function FilterMenu({
  criteria,
  dateName,
  from,
  to,
  activePreset,
  fixedParams,
}: {
  criteria: FilterCriterion[]
  /** What the ngày submenu row is called: Ngày đo, Ngày nhập, Ngày bán. */
  dateName: string
  from?: string
  to?: string
  activePreset?: DatePreset
  /** What every URL this pushes must carry regardless — the Hàng tồn tab. */
  fixedParams?: Record<string, string>
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isClearing, startClearing] = useTransition()
  // What the menu shows while the table behind it is still catching up. It falls back to the
  // filter the server applied the moment the new rows commit, so a pick the server refused —
  // a hầm this trạm doesn't have — un-ticks itself. Rebuilding the picks map on every render
  // is what keeps that true: it is the server's answer, not a remembered one.
  const [shown, showOptimistic] = useOptimistic<AppliedFilter>({
    from,
    to,
    preset: activePreset,
    picks: Object.fromEntries(criteria.map((criterion) => [criterion.param, criterion.picks])),
  })

  /** What is ticked under one criterion, as the screen currently shows it. */
  function pickedIn(param: string): string[] {
    return shown.picks[param] ?? []
  }

  function push(next: AppliedFilter, start: React.TransitionStartFunction) {
    // Empty criteria are dropped so clearing one takes it out of the URL instead of
    // leaving `?from=` behind. With a fixed parameter there is always a query to push,
    // which is what keeps a Hàng tồn tab from falling back to the first one.
    const qs = filterQuery({
      ...fixedParams,
      from: next.from,
      to: next.to,
      ...Object.fromEntries(
        criteria.map((criterion) => [criterion.param, next.picks[criterion.param] ?? []])
      ),
    })
    start(() => {
      showOptimistic(next)
      router.push(qs ? `${pathname}?${qs}` : pathname)
    })
  }

  function pushPicks(param: string, values: string[]) {
    push({ ...shown, picks: { ...shown.picks, [param]: values } }, startTransition)
  }

  // Ticking a value rebuilds the list from what is on offer rather than appending to it, so
  // what goes in the URL is in one settled order however it was clicked — the same order
  // the server reads it back in.
  function toggle(criterion: FilterCriterion, value: string, ticked: boolean) {
    const picked = pickedIn(criterion.param)
    pushPicks(
      criterion.param,
      criterion.options
        .filter((option) => (option.value === value ? ticked : picked.includes(option.value)))
        .map((option) => option.value)
    )
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

  // Back to the whole list in one action — every criterion and the page at once.
  function onClear() {
    push({ picks: {} }, startClearing)
  }

  const noDates = !shown.from && !shown.to
  // The same rule each screen's `has*Filter` states for the server, asked here of the
  // criteria this menu was given.
  const hasFilter = Boolean(
    shown.from || shown.to || criteria.some((criterion) => pickedIn(criterion.param).length)
  )

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={isPending}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="icon-sm" variant="outline" aria-label={vi.common.filterMenu}>
            <ListFilter />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-60">
          {criteria.map((criterion) => (
            <DropdownMenuSub key={criterion.param}>
              <DropdownMenuSubTrigger>
                <span className="flex-1">{criterion.name}</span>
                <span className="text-muted-foreground ml-2 truncate text-xs">
                  {picksLabel(pickedIn(criterion.param), criterion)}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
                  <DropdownMenuCheckboxItem
                    checked={pickedIn(criterion.param).length === 0}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => {
                      if (pickedIn(criterion.param).length) pushPicks(criterion.param, [])
                    }}
                  >
                    {criterion.all}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  {criterion.options.map((option) => (
                    <DropdownMenuCheckboxItem
                      key={option.value}
                      checked={pickedIn(criterion.param).includes(option.value)}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={(ticked) => toggle(criterion, option.value, ticked === true)}
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
              <span className="flex-1">{dateName}</span>
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
      {criteria.map((criterion) =>
        pickedIn(criterion.param).length > 0 ? (
          <FilterChip
            key={criterion.param}
            label={picksLabel(pickedIn(criterion.param), criterion)}
            removeLabel={criterion.removeLabel}
            onRemove={() => pushPicks(criterion.param, [])}
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
      {hasFilter ? (
        <Button type="button" size="sm" variant="ghost" loading={isClearing} onClick={onClear}>
          {vi.common.clearFilter}
        </Button>
      ) : null}
    </div>
  )
}
