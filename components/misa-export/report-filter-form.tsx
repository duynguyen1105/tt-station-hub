'use client'

import { FilterMenu } from '@/components/shared/filter-menu'
import type { DatePreset } from '@/lib/filters/date-presets'
import { vi } from '@/messages/vi'

/**
 * The khoảng ngày kế toán is closing and the trạm whose books they are closing — over
 * the ca's own ngày bán.
 *
 * The trạm offered are the ones the viewer can reach and no others, closed ones
 * included: this is a historical report, and a trạm that stopped trading in tháng 6
 * still has tháng 6 ca to export. Ticking none of them means tất cả trạm.
 *
 * The menu itself is `FilterMenu`, which every bộ lọc in the app shares — the folded
 * criteria, the chips, the ngày presets and Xóa bộ lọc all live there. What is left here
 * is only what Báo cáo MISA knows: that it filters on trạm, and that a trạm reaches the
 * menu as the `id` the URL carries under the `name` kế toán reads.
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
  return (
    <FilterMenu
      from={from}
      to={to}
      activePreset={activePreset}
      dateName={vi.misaExport.reportSaleDate}
      criteria={[
        {
          param: 'station',
          name: vi.misaExport.reportStation,
          options: stationOptions.map((station) => ({
            value: station.id,
            label: station.name,
          })),
          picks: stations,
          all: vi.misaExport.reportAllStations,
          count: vi.misaExport.reportStationCount,
          removeLabel: vi.misaExport.reportClearStations,
        },
      ]}
    />
  )
}
