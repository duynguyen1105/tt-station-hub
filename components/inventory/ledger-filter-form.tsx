'use client'

import { FilterMenu, type FilterOption } from '@/components/shared/filter-menu'
import type { DatePreset } from '@/lib/filters/date-presets'
import { vi } from '@/messages/vi'

/** The tab this bộ lọc belongs to; every URL it pushes has to land back on it. */
const TAB = 'so-sach'

/**
 * The khoảng ngày of sổ sách kế toán is reading, and the nhiên liệu they are reading it
 * for — over the ngày each lít actually moved.
 *
 * This is the Báo cáo MISA bộ lọc with nhiên liệu where trạm sits: this page is already
 * one trạm, and at a trạm selling four nhiên liệu a month of trading is six pages of
 * ngày × nhiên liệu with no way through it.
 *
 * The nhiên liệu offered are the ones the sổ sách holds a ngày for, so every one of them
 * returns rows, and one Trường Thịnh has since stopped selling is still there while its
 * ngày are. Ticking none of them means tất cả nhiên liệu.
 *
 * Every URL this pushes carries the tab, including the one Xóa bộ lọc pushes: the bare
 * path is Tổng quan, and clearing a filter must not move kế toán off the sổ sách they
 * are reading. The page is always dropped, since a narrower filter makes page 3
 * meaningless.
 *
 * The menu itself is `FilterMenu`, which every bộ lọc in the app shares. What is left
 * here is only what Sổ sách nhiên liệu knows: that it filters on nhiên liệu, what kế
 * toán calls that, and that the URL has to keep the tab.
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
  fuelOptions: FilterOption[]
  activePreset?: DatePreset
}) {
  return (
    <FilterMenu
      from={from}
      to={to}
      activePreset={activePreset}
      dateName={vi.inventory.date}
      fixedParams={{ tab: TAB }}
      criteria={[
        {
          param: 'fuel',
          name: vi.inventory.fuelType,
          options: fuelOptions,
          picks: fuels,
          all: vi.inventory.allFuels,
          count: vi.inventory.fuelCount,
          removeLabel: vi.inventory.clearFuelFilter,
        },
      ]}
    />
  )
}
