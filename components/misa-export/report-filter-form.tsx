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
import { hasMisaReportFilter } from '@/lib/misa-export/report-selection'
import { vi } from '@/messages/vi'

/**
 * The bộ lọc as the screen holds it: what is in the URL, plus the preset those two
 * ngày happen to be. The preset is carried rather than worked out while rendering,
 * because working it out needs the clock — and a clock read during render is a clock
 * the server and the browser can disagree about either side of midnight.
 */
type AppliedFilter = DateFilter & { stations: string[] }

/**
 * What the trạm chip says. One trạm is worth naming — it is the cut kế toán makes most
 * often and the name is what they are looking for. Several is a count: the names would
 * not fit, and the submenu is one click away for anyone who wants them.
 */
function stationLabel(stations: string[], options: { id: string; name: string }[]): string {
  if (stations.length === 0) return vi.misaExport.reportAllStations
  if (stations.length === 1) {
    const only = options.find((option) => option.id === stations[0])
    if (only) return only.name
  }
  return vi.misaExport.reportStationCount(stations.length)
}

/**
 * The khoảng ngày kế toán is closing and the trạm whose books they are closing — over
 * the ca's own ngày bán.
 *
 * A single icon opening a menu of criteria, rather than a row of controls: the bộ lọc
 * is reached now and then and the list is what the screen is for, so the criteria stay
 * folded away until asked for. What *is* applied never hides — it reads as a chip
 * beside the icon, and each chip drops its own criterion without touching the other.
 *
 * The filter lives in the URL, so a filtered view survives a refresh and can be sent to
 * a colleague. Every pick applies straight away through the router: there is no Lọc
 * button to remember, and `useOptimistic` ticks the box on the click rather than a
 * round-trip later, so the menu can be worked down at the speed it is read.
 *
 * The trạm offered are the ones the viewer can reach and no others, closed ones
 * included: this is a historical report, and a trạm that stopped trading in tháng 6
 * still has tháng 6 ca to export. Ticking none of them means tất cả trạm.
 *
 * Hôm nay / Tháng này / Tháng trước are worth exactly the two ngày they set, so a
 * preset and a hand-typed range are the same filter and the URL stays the only record
 * of what is on screen. They are ticked by recognising those two ngày rather than by
 * being remembered anywhere.
 *
 * Xóa bộ lọc is offered only once something is actually narrowing the list, and puts kế
 * toán back on the full outstanding list in one action — trạm, both ngày and the page
 * at once.
 */
export function ReportFilterForm({
  from,
  to,
  stations,
  stationOptions,
  activePreset,
}: {
  from?: string
  to?: string
  stations: string[]
  stationOptions: { id: string; name: string }[]
  activePreset?: DatePreset
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isClearing, startClearing] = useTransition()
  // What the menu shows while the list behind it is still catching up. It falls back
  // to the filter the server applied the moment the new rows commit, so a pick the
  // server refused — a trạm this viewer can't reach — un-ticks itself.
  const [shown, showOptimistic] = useOptimistic<AppliedFilter>({
    from,
    to,
    stations,
    preset: activePreset,
  })

  // No page: a narrower filter makes page 3 meaningless, so applying one starts
  // again at the top of what it matched. Empty ngày are dropped so clearing one
  // takes it out of the URL instead of leaving `?from=` behind.
  function push(next: AppliedFilter, start: React.TransitionStartFunction) {
    const params = new URLSearchParams()
    if (next.from) params.set('from', next.from)
    if (next.to) params.set('to', next.to)
    if (next.stations.length) params.set('station', next.stations.join(','))
    const qs = params.toString()
    start(() => {
      showOptimistic(next)
      router.push(qs ? `${pathname}?${qs}` : pathname)
    })
  }

  // Ticking a trạm rebuilds the list from the trạm on offer rather than appending to
  // it, so what goes in the URL is in one settled order however it was clicked.
  function toggleStation(id: string, ticked: boolean) {
    const next = stationOptions
      .filter((option) => (option.id === id ? ticked : shown.stations.includes(option.id)))
      .map((option) => option.id)
    push({ ...shown, stations: next }, startTransition)
  }

  // A preset fills the same two ngày kế toán could have typed, and is ticked from
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

  function clearStations() {
    push({ ...shown, stations: [] }, startTransition)
  }

  // Nothing to put back in the URL: the bare path is the unfiltered list, and the page
  // goes with the filter that made it meaningful.
  function onClear() {
    push({ stations: [] }, startClearing)
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
              <span className="flex-1">{vi.misaExport.reportStation}</span>
              <span className="text-muted-foreground ml-2 truncate text-xs">
                {stationLabel(shown.stations, stationOptions)}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
                <DropdownMenuCheckboxItem
                  checked={shown.stations.length === 0}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => {
                    if (shown.stations.length) clearStations()
                  }}
                >
                  {vi.misaExport.reportAllStations}
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                {stationOptions.map((option) => (
                  <DropdownMenuCheckboxItem
                    key={option.id}
                    checked={shown.stations.includes(option.id)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(ticked) => toggleStation(option.id, ticked === true)}
                  >
                    {option.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span className="flex-1">{vi.misaExport.reportSaleDate}</span>
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
      {shown.stations.length > 0 ? (
        <FilterChip
          label={stationLabel(shown.stations, stationOptions)}
          removeLabel={vi.misaExport.reportClearStations}
          onRemove={clearStations}
        />
      ) : null}
      {noDates ? null : (
        <FilterChip
          label={dateFilterLabel(shown)}
          removeLabel={vi.common.clearDateFilter}
          onRemove={clearDates}
        />
      )}
      {hasMisaReportFilter(shown) ? (
        <Button type="button" size="sm" variant="ghost" loading={isClearing} onClick={onClear}>
          {vi.common.clearFilter}
        </Button>
      ) : null}
    </div>
  )
}
