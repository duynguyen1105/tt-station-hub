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
import type { ShiftStatus } from '@/lib/auth/reading-policy'
import { type DatePreset, datePresetRange, matchingDatePreset } from '@/lib/filters/date-presets'
import { SHIFT_STATUSES, hasShiftListFilter } from '@/lib/shifts/shift-list-selection'
import { shiftStatusInfo } from '@/lib/ui/status'
import { vi } from '@/messages/vi'

/**
 * The bộ lọc as the screen holds it: what is in the URL, plus the preset those two
 * ngày happen to be. The preset is carried rather than worked out while rendering,
 * because working it out needs the clock — and a clock read during render is a clock
 * the server and the browser can disagree about either side of midnight.
 */
type AppliedFilter = DateFilter & { statuses: ShiftStatus[] }

/**
 * What the trạng thái chip says. One is worth naming — it is the cut made most often,
 * and the name is what is being looked for. Several is a count: the names would not
 * fit, and the submenu is one click away for anyone who wants them.
 */
function statusLabel(statuses: ShiftStatus[]): string {
  if (statuses.length === 0) return vi.common.filterAll
  const [only] = statuses
  if (statuses.length === 1 && only) return shiftStatusInfo(only).label
  return vi.shifts.statusCount(statuses.length)
}

/**
 * The ca of this trạm worth looking at right now: the trạng thái they are in and the
 * khoảng ngày they were sold over.
 *
 * A single icon opening a menu of criteria, rather than a row of controls: the bộ lọc
 * is reached now and then and the list is what the tab is for, so the criteria stay
 * folded away until asked for. What *is* applied never hides — it reads as a chip
 * beside the icon, and each chip drops its own criterion without touching the other.
 *
 * This is the Báo cáo MISA bộ lọc with trạng thái where its trạm was: this tab is
 * already one trạm, and the question it exists to answer — which ca still need someone
 * — is a question about trạng thái. Ticking none of them means tất cả.
 *
 * The filter lives in the URL, so a filtered view survives a refresh and can be sent to
 * a colleague. Every pick applies straight away through the router: there is no Lọc
 * button to remember, and `useOptimistic` ticks the box on the click rather than a
 * round-trip later, so the menu can be worked down at the speed it is read.
 *
 * Hôm nay / Tháng này / Tháng trước are worth exactly the two ngày they set, so a
 * preset and a hand-typed range are the same filter and the URL stays the only record
 * of what is on screen. They are ticked by recognising those two ngày rather than by
 * being remembered anywhere.
 *
 * Xóa bộ lọc is offered only once something is actually narrowing the list, and puts
 * the full list back in one action — trạng thái, both ngày and the page at once.
 */
export function ShiftFilterForm({
  from,
  to,
  statuses,
  activePreset,
}: {
  from?: string
  to?: string
  statuses: ShiftStatus[]
  activePreset?: DatePreset
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isClearing, startClearing] = useTransition()
  // What the menu shows while the list behind it is still catching up. It falls back
  // to the filter the server applied the moment the new rows commit, so a pick the
  // server refused — a trạng thái no ca is ever in — un-ticks itself.
  const [shown, showOptimistic] = useOptimistic<AppliedFilter>({
    from,
    to,
    statuses,
    preset: activePreset,
  })

  // No page: a narrower filter makes page 3 meaningless, so applying one starts again
  // at the top of what it matched. Empty ngày are dropped so clearing one takes it out
  // of the URL instead of leaving `?from=` behind.
  function push(next: AppliedFilter, start: React.TransitionStartFunction) {
    const params = new URLSearchParams()
    if (next.from) params.set('from', next.from)
    if (next.to) params.set('to', next.to)
    if (next.statuses.length) params.set('status', next.statuses.join(','))
    const qs = params.toString()
    start(() => {
      showOptimistic(next)
      router.push(qs ? `${pathname}?${qs}` : pathname)
    })
  }

  // Ticking a trạng thái rebuilds the list from the states a ca passes through rather
  // than appending to it, so what goes in the URL is in one settled order however it
  // was clicked.
  function toggleStatus(status: ShiftStatus, ticked: boolean) {
    const next = SHIFT_STATUSES.filter((s) => (s === status ? ticked : shown.statuses.includes(s)))
    push({ ...shown, statuses: next }, startTransition)
  }

  // A preset fills the same two ngày that could have been typed, and is ticked from
  // here on because these are the two ngày it stands for.
  function applyPreset(preset: DatePreset) {
    const range = datePresetRange(preset, new Date())
    push({ ...shown, from: range.from, to: range.to, preset }, startTransition)
  }

  // A ngày typed by hand may land on a preset's range, and then it is that preset.
  // The clock is read here, in the click, and never while rendering.
  function setDay(edge: 'from' | 'to', value: string) {
    const next = { ...shown, [edge]: value || undefined }
    push({ ...next, preset: matchingDatePreset(next.from, next.to, new Date()) }, startTransition)
  }

  function clearDates() {
    push({ ...shown, from: undefined, to: undefined, preset: undefined }, startTransition)
  }

  function clearStatuses() {
    push({ ...shown, statuses: [] }, startTransition)
  }

  // Nothing to put back in the URL: the bare path is the unfiltered list, and the page
  // goes with the filter that made it meaningful.
  function onClear() {
    push({ statuses: [] }, startClearing)
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
              <span className="flex-1">{vi.shifts.status}</span>
              <span className="text-muted-foreground ml-2 truncate text-xs">
                {statusLabel(shown.statuses)}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-56">
                <DropdownMenuCheckboxItem
                  checked={shown.statuses.length === 0}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => {
                    if (shown.statuses.length) clearStatuses()
                  }}
                >
                  {vi.common.filterAll}
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                {SHIFT_STATUSES.map((status) => (
                  <DropdownMenuCheckboxItem
                    key={status}
                    checked={shown.statuses.includes(status)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(ticked) => toggleStatus(status, ticked === true)}
                  >
                    {shiftStatusInfo(status).label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span className="flex-1">{vi.shifts.date}</span>
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
      {shown.statuses.length > 0 ? (
        <FilterChip
          label={statusLabel(shown.statuses)}
          removeLabel={vi.shifts.clearStatuses}
          onRemove={clearStatuses}
        />
      ) : null}
      {noDates ? null : (
        <FilterChip
          label={dateFilterLabel(shown)}
          removeLabel={vi.common.clearDateFilter}
          onRemove={clearDates}
        />
      )}
      {hasShiftListFilter(shown) ? (
        <Button type="button" size="sm" variant="ghost" loading={isClearing} onClick={onClear}>
          {vi.common.clearFilter}
        </Button>
      ) : null}
    </div>
  )
}
