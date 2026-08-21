'use client'

import { useRef, useState, useTransition } from 'react'

import { usePathname, useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { type ReportPreset, reportPresetRange } from '@/lib/misa-export/report-presets'
import { hasMisaReportFilter } from '@/lib/misa-export/report-selection'
import { vi } from '@/messages/vi'

/** What "Tất cả trạm" is worth in the dropdown; it leaves no `station` in the URL. */
const ALL_STATIONS = 'all'

/** The khoảng ngày worth a button of their own, in the order kế toán reaches for them. */
const PRESETS: { preset: ReportPreset; label: string }[] = [
  { preset: 'today', label: vi.common.today },
  { preset: 'thisMonth', label: vi.common.thisMonth },
  { preset: 'lastMonth', label: vi.common.lastMonth },
]

/**
 * The khoảng ngày kế toán is closing and, optionally, the one trạm whose books they
 * are closing — over the ca's own ngày bán.
 *
 * The filter lives in the URL, so a filtered view survives a refresh and can be sent
 * to a colleague. The submit goes through the router rather than as a native GET so
 * `isPending` spans the RSC round-trip — the Lọc button stays busy until the new rows
 * commit. Follows the Hàng tồn import filter, which exists for exactly this reason.
 *
 * The trạm offered are the ones the viewer can reach and no others, closed ones
 * included: this is a historical report, and a trạm that stopped trading in tháng 6
 * still has tháng 6 ca to export.
 *
 * Hôm nay / Tháng này / Tháng trước write into those same two ngày inputs and do
 * nothing else, so the URL stays the only record of what is on screen.
 *
 * Xóa bộ lọc is offered only once something is actually narrowing the list, and puts
 * kế toán back on the full outstanding list in one action — trạm, both ngày and the
 * page at once.
 */
export function ReportFilterForm({
  from,
  to,
  station,
  stations,
}: {
  from?: string
  to?: string
  station?: string
  stations: { id: string; name: string }[]
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isClearing, startClearing] = useTransition()
  // The trạm is held here rather than read off the form: a Radix select is not a
  // native control, and the value is only ever one this dropdown offered.
  const [selectedStation, setSelectedStation] = useState(station ?? ALL_STATIONS)
  const fromRef = useRef<HTMLInputElement>(null)
  const toRef = useRef<HTMLInputElement>(null)

  // Kế toán reads the ngày a preset wrote, can edit either one, and presses Lọc as
  // they would for ngày they typed by hand.
  function applyPreset(preset: ReportPreset) {
    const range = reportPresetRange(preset, new Date())
    if (fromRef.current) fromRef.current.value = range.from
    if (toRef.current) toRef.current.value = range.to
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const params = new URLSearchParams()
    for (const [key, value] of new FormData(e.currentTarget)) {
      // Empty date inputs are dropped so clearing one takes it out of the URL
      // instead of leaving `?from=` behind.
      if (typeof value === 'string' && value) params.set(key, value)
    }
    // Tất cả trạm is the absence of a trạm filter, so it leaves nothing behind.
    if (selectedStation !== ALL_STATIONS) params.set('station', selectedStation)
    // No page: a narrower filter makes page 3 meaningless, so applying one
    // starts again at the top of what it matched.
    const qs = params.toString()
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname))
  }

  // Nothing to put back in the URL: the bare path is the unfiltered list, and the
  // page goes with the filter that made it meaningful. The re-render remounts these
  // inputs empty, since the page keys this form by the filter it applied.
  function onClear() {
    startClearing(() => router.push(pathname))
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2 text-sm">
      <label className="text-muted-foreground flex items-center gap-1">
        {vi.common.fromDate}
        <Input type="date" name="from" ref={fromRef} defaultValue={from} className="h-8 w-auto" />
      </label>
      <label className="text-muted-foreground flex items-center gap-1">
        {vi.common.toDate}
        <Input type="date" name="to" ref={toRef} defaultValue={to} className="h-8 w-auto" />
      </label>
      {PRESETS.map(({ preset, label }) => (
        <Button
          key={preset}
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => applyPreset(preset)}
        >
          {label}
        </Button>
      ))}
      <Select value={selectedStation} onValueChange={setSelectedStation}>
        <SelectTrigger size="sm" className="w-56" aria-label={vi.shifts.station}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_STATIONS}>{vi.misaExport.reportAllStations}</SelectItem>
          {stations.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" size="sm" variant="outline" loading={isPending}>
        {vi.common.filter}
      </Button>
      {hasMisaReportFilter({ from, to, station }) && (
        <Button type="button" size="sm" variant="ghost" loading={isClearing} onClick={onClear}>
          {vi.common.clearFilter}
        </Button>
      )}
    </form>
  )
}
