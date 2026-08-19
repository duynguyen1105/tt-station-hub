import { notFound } from 'next/navigation'

import { MisaFuelMapForm } from '@/components/misa-export/fuel-map-form'
import { StationFuelAreaForm } from '@/components/stations/station-fuel-area-form'
import { Badge } from '@/components/ui/badge'
import { requireStationAccess } from '@/lib/auth/station-guard'
import { addableFuels } from '@/lib/fuels/catalogue'
import { loadFuelCatalogue } from '@/lib/fuels/load-catalogue'
import { prisma } from '@/lib/prisma'
import { cn } from '@/lib/utils'
import { vi } from '@/messages/vi'

export default async function StationConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireStationAccess(id)

  const station = await prisma.station.findUnique({ where: { id } })
  if (!station) notFound()

  const entries = await prisma.misaFuelMap.findMany({ where: { stationId: id } })
  const byFuel = new Map(entries.map((e) => [e.fuelType, e]))

  // The trạm's declaration of what it sells: one row per nhiên liệu it has a mã hàng
  // for, in danh mục order. A nhiên liệu đã ngừng the trạm mapped before Trường Thịnh
  // stopped selling it keeps its row, so what the trạm sold still reads — the row is
  // marked Đã ngừng and its menu offers no Chỉnh sửa, because the route refuses to write
  // a nhiên liệu that is ngừng and a button that can only fail is worse than none. Xóa
  // khỏi trạm it still offers: that row is exactly the one a trạm wants cleared.
  const catalogue = await loadFuelCatalogue()
  const rows = catalogue.flatMap((fuel) => {
    const entry = byFuel.get(fuel.fuelType)
    return entry ? [{ name: fuel.name, isActive: fuel.isActive, entry }] : []
  })
  const addable = addableFuels(catalogue, [...byFuel.keys()])

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <div>
          <h2 className="text-sm font-medium">{vi.misaSettings.fuelAreaLabel}</h2>
          <p className="text-muted-foreground text-sm">{vi.misaSettings.fuelAreaNote}</p>
        </div>
        <StationFuelAreaForm stationId={id} fuelArea={station.fuelArea} />
      </section>

      <section className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium">{vi.misaSettings.fuelMap}</h2>
            <p className="text-muted-foreground text-sm">{vi.misaSettings.fuelMapNote}</p>
          </div>
          <MisaFuelMapForm stationId={id} addable={addable} />
        </div>

        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{vi.misaSettings.fuelMapEmpty}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="p-2">{vi.misaSettings.fuel}</th>
                <th className="p-2">{vi.misaSettings.productCode}</th>
                <th className="p-2">{vi.misaSettings.productName}</th>
                <th className="p-2">{vi.misaSettings.warehouseCode}</th>
                <th className="p-2">{vi.misaSettings.unit}</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ name, isActive, entry }) => (
                <tr
                  key={entry.fuelType}
                  className={cn('border-b', !isActive && 'text-muted-foreground')}
                >
                  <td className="p-2">
                    {name}
                    {!isActive && (
                      <Badge variant="secondary" className="ml-2 font-normal">
                        {vi.misaSettings.fuelInactive}
                      </Badge>
                    )}
                  </td>
                  <td className="readout p-2">{entry.productCode}</td>
                  <td className="readout p-2">{entry.productName ?? '—'}</td>
                  <td className="readout p-2">{entry.warehouseCode}</td>
                  <td className="readout p-2">{entry.unit ?? '—'}</td>
                  <td className="p-2 text-right">
                    <MisaFuelMapForm
                      stationId={id}
                      isActive={isActive}
                      entry={{
                        fuelType: entry.fuelType,
                        productCode: entry.productCode,
                        productName: entry.productName,
                        warehouseCode: entry.warehouseCode,
                        unit: entry.unit,
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
