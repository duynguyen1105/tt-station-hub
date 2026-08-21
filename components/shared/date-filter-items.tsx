'use client'

import { DropdownMenuCheckboxItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { type DatePreset } from '@/lib/filters/date-presets'
import { vi } from '@/messages/vi'

/** The khoảng ngày worth a line of their own, in the order kế toán reaches for them. */
export const DATE_PRESET_OPTIONS: { preset: DatePreset; label: string }[] = [
  { preset: 'today', label: vi.common.today },
  { preset: 'thisMonth', label: vi.common.thisMonth },
  { preset: 'lastMonth', label: vi.common.lastMonth },
]

/** A khoảng ngày as a bộ lọc holds it: the two ngày, and the preset they happen to be. */
export type DateFilter = { from?: string; to?: string; preset?: DatePreset }

/** A ngày the way kế toán reads it, by moving the pieces — never through a timezone. */
export function dayLabel(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

/** What the ngày chip says: the preset by name, or the range as it was typed. */
export function dateFilterLabel(filter: DateFilter): string {
  const preset = DATE_PRESET_OPTIONS.find((option) => option.preset === filter.preset)
  if (preset) return preset.label
  if (filter.from && filter.to) return `${dayLabel(filter.from)} – ${dayLabel(filter.to)}`
  if (filter.from) return `${vi.common.fromDate} ${dayLabel(filter.from)}`
  if (filter.to) return `${vi.common.toDate} ${dayLabel(filter.to)}`
  return vi.common.filterAll
}

/**
 * The khoảng ngày half of a bộ lọc: Tất cả, the three presets, and the two ngày
 * underneath for a range that is none of them.
 *
 * These are menu items and nothing more, so the same component sits directly in a
 * `DropdownMenuContent` on a screen whose only criterion is ngày, and in a
 * `DropdownMenuSubContent` on a screen that narrows by something else as well.
 *
 * A preset is worth exactly the two ngày it sets, so a preset and a hand-typed range
 * are the same filter and the URL stays the only record of what is on screen. Which
 * one is ticked is decided by recognising those two ngày, not by remembering anything.
 */
export function DateFilterItems({
  filter,
  onPreset,
  onClearDates,
  onDay,
}: {
  filter: DateFilter
  onPreset: (preset: DatePreset) => void
  onClearDates: () => void
  onDay: (edge: 'from' | 'to', value: string) => void
}) {
  const noDates = !filter.from && !filter.to
  return (
    <>
      <DropdownMenuCheckboxItem
        checked={noDates}
        onSelect={(e) => e.preventDefault()}
        onCheckedChange={() => {
          if (!noDates) onClearDates()
        }}
      >
        {vi.common.filterAll}
      </DropdownMenuCheckboxItem>
      {DATE_PRESET_OPTIONS.map(({ preset, label }) => (
        <DropdownMenuCheckboxItem
          key={preset}
          checked={filter.preset === preset}
          onSelect={(e) => e.preventDefault()}
          onCheckedChange={() => onPreset(preset)}
        >
          {label}
        </DropdownMenuCheckboxItem>
      ))}
      <DropdownMenuSeparator />
      {/* The one place a real input sits inside a menu. A menu answers keystrokes by
          jumping to the item that starts with them, which would eat the digits of a
          ngày, so they are stopped here — these are not menu items and have no use
          for that behaviour. */}
      <div className="grid gap-2 p-1.5" onKeyDown={(e) => e.stopPropagation()}>
        <label className="text-muted-foreground grid gap-1 text-xs">
          {vi.common.fromDate}
          <Input
            type="date"
            value={filter.from ?? ''}
            onChange={(e) => onDay('from', e.target.value)}
            className="h-8"
          />
        </label>
        <label className="text-muted-foreground grid gap-1 text-xs">
          {vi.common.toDate}
          <Input
            type="date"
            value={filter.to ?? ''}
            onChange={(e) => onDay('to', e.target.value)}
            className="h-8"
          />
        </label>
      </div>
    </>
  )
}
