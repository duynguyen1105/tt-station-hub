'use client'

import { FilterMenu, type FilterOption } from '@/components/shared/filter-menu'
import type { DatePreset } from '@/lib/filters/date-presets'
import { vi } from '@/messages/vi'

/** The tab this bộ lọc belongs to; every URL it pushes has to land back on it. */
const TAB = 'do-bon'

/**
 * Which đo hầm kế toán is looking at: the hầm, the nhiên liệu, the trạng thái, and the
 * khoảng ngày the dip-stick was photographed over.
 *
 * Ticking none of a criterion means tất cả — including trạng thái, so the unfiltered table
 * still lists a từ chối read, badged. This history is the audit trail of what was decided,
 * and narrowing it is something kế toán asks for rather than something it does by default.
 *
 * Every URL this pushes carries the tab, including the one Xóa bộ lọc pushes: the bare
 * path is Tổng quan, and clearing a filter must not move kế toán off the history they are
 * reading.
 *
 * The menu itself is `FilterMenu`, which every bộ lọc in the app shares — the folded
 * criteria, the chips, the ngày presets and Xóa bộ lọc all live there. What is left here
 * is only what Lịch sử đo bồn knows: which three criteria there are, what kế toán calls
 * them, which parameter each rides in, and that the URL has to keep the tab.
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
  tankOptions: FilterOption[]
  fuelOptions: FilterOption[]
  statusOptions: FilterOption[]
  activePreset?: DatePreset
}) {
  return (
    <FilterMenu
      from={from}
      to={to}
      activePreset={activePreset}
      dateName={vi.inventory.dipMeasuredDate}
      fixedParams={{ tab: TAB }}
      criteria={[
        {
          param: 'tank',
          name: vi.inventory.tank,
          options: tankOptions,
          picks: tanks,
          all: vi.inventory.allTanks,
          count: vi.inventory.tankCount,
          removeLabel: vi.inventory.clearTankFilter,
        },
        {
          param: 'fuel',
          name: vi.inventory.fuelType,
          options: fuelOptions,
          picks: fuels,
          all: vi.inventory.allFuels,
          count: vi.inventory.fuelCount,
          removeLabel: vi.inventory.clearFuelFilter,
        },
        {
          param: 'status',
          name: vi.inventory.status,
          options: statusOptions,
          picks: statuses,
          all: vi.inventory.allStatuses,
          count: vi.inventory.statusCount,
          removeLabel: vi.inventory.clearStatusFilter,
        },
      ]}
    />
  )
}
