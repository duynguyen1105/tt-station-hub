'use client'

import { FilterMenu } from '@/components/shared/filter-menu'
import type { ShiftStatus } from '@/lib/auth/reading-policy'
import type { DatePreset } from '@/lib/filters/date-presets'
import { SHIFT_STATUSES } from '@/lib/shifts/shift-list-selection'
import { shiftStatusInfo } from '@/lib/ui/status'
import { vi } from '@/messages/vi'

/**
 * The ca of this trạm worth looking at right now: the trạng thái they are in and the
 * khoảng ngày they were sold over.
 *
 * This is the Báo cáo MISA bộ lọc with trạng thái where its trạm was: this tab is
 * already one trạm, and the question it exists to answer — which ca still need someone
 * — is a question about trạng thái. Ticking none of them means tất cả.
 *
 * The trạng thái offered are every one a ca is ever written with, in the order
 * `shiftListSelection` narrows the URL against, rather than the ones this trạm happens
 * to have today: an empty trạng thái is an answer worth being able to ask for.
 *
 * The menu itself is `FilterMenu`, which every bộ lọc in the app shares — the folded
 * criteria, the chips, the ngày presets and Xóa bộ lọc all live there. What is left here
 * is only what Chốt ca knows: that it filters on trạng thái, and what kế toán calls each
 * one.
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
  return (
    <FilterMenu
      from={from}
      to={to}
      activePreset={activePreset}
      dateName={vi.shifts.date}
      criteria={[
        {
          param: 'status',
          name: vi.shifts.status,
          options: SHIFT_STATUSES.map((status) => ({
            value: status,
            label: shiftStatusInfo(status).label,
          })),
          picks: statuses,
          all: vi.common.filterAll,
          count: vi.shifts.statusCount,
          removeLabel: vi.shifts.clearStatuses,
        },
      ]}
    />
  )
}
