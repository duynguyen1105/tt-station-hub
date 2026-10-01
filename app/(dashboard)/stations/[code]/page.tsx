import {
  AttentionPanel,
  DebtPanel,
  FuelMix,
  RecentReceipts,
  RecentShifts,
  SalesChart,
  SalesKpis,
  StockPanel,
  fuelOrder,
} from '@/components/stations/station-overview'
import { loadStationBySlug, requireStationAccess } from '@/lib/auth/station-guard'
import { fuelTypeLabeller } from '@/lib/fuels/load-catalogue'
import { loadStationOverview } from '@/lib/stations/load-overview'

/**
 * The Tổng quan tab: what is left to do at this trạm, how it is selling, what is in the
 * hầm, who owes, and what moved lately — each section linking to the tab that holds it.
 */
export default async function StationOverviewPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const station = await loadStationBySlug(code)
  await requireStationAccess(station.id)

  const [data, fuelLabel] = await Promise.all([loadStationOverview(station), fuelTypeLabeller()])
  const fuels = fuelOrder(data)

  return (
    <div className="space-y-3">
      <AttentionPanel code={station.code} data={data} fuelLabel={fuelLabel} />
      <SalesKpis code={station.code} data={data} />
      <div className="grid gap-3 lg:grid-cols-3">
        <SalesChart data={data} fuels={fuels} fuelLabel={fuelLabel} />
        <FuelMix data={data} fuels={fuels} fuelLabel={fuelLabel} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <StockPanel code={station.code} data={data} fuels={fuels} fuelLabel={fuelLabel} />
        <DebtPanel code={station.code} data={data} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <RecentShifts code={station.code} shifts={data.recentShifts} />
        <RecentReceipts code={station.code} data={data} fuelLabel={fuelLabel} />
      </div>
    </div>
  )
}
