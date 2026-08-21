'use client'

import { FilterMenu, type FilterOption } from '@/components/shared/filter-menu'
import type { DatePreset } from '@/lib/filters/date-presets'
import { vi } from '@/messages/vi'

/** The tab this bộ lọc belongs to; every URL it pushes has to land back on it. */
const TAB = 'nhap-hang'

/**
 * Which phiếu nhập kế toán is looking at: the hầm the xe bồn discharged into, the nhiên
 * liệu, whoever recorded the slip, and the khoảng ngày it was discharged over.
 *
 * Ticking none of a criterion means tất cả, including a phiếu đã hủy: this list is the
 * record of every delivery taken, and narrowing it is something kế toán asks for rather
 * than something it does by default.
 *
 * Every URL this pushes carries the tab, including the one Xóa bộ lọc pushes: the bare
 * path is Tổng quan, and clearing a filter must not move kế toán off the list they are
 * reading.
 *
 * The menu itself is `FilterMenu`, which every bộ lọc in the app shares — the folded
 * criteria, the chips, the ngày presets and Xóa bộ lọc all live there. What is left here
 * is only what Lịch sử nhập hàng knows: which three criteria there are, what kế toán
 * calls them, which parameter each rides in, and that the URL has to keep the tab.
 */
export function ImportFilterForm({
  from,
  to,
  tanks,
  fuels,
  creators,
  tankOptions,
  fuelOptions,
  creatorOptions,
  activePreset,
}: {
  from?: string
  to?: string
  tanks: string[]
  fuels: string[]
  creators: string[]
  tankOptions: FilterOption[]
  fuelOptions: FilterOption[]
  creatorOptions: FilterOption[]
  activePreset?: DatePreset
}) {
  return (
    <FilterMenu
      from={from}
      to={to}
      activePreset={activePreset}
      dateName={vi.imports.importedAt}
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
          param: 'creator',
          name: vi.imports.creator,
          options: creatorOptions,
          picks: creators,
          all: vi.imports.allCreators,
          count: vi.imports.creatorCount,
          removeLabel: vi.imports.clearCreatorFilter,
        },
      ]}
    />
  )
}
