import { notFound } from 'next/navigation'

import { MisaFuelMapForm } from '@/components/misa-export/fuel-map-form'
import { DispenserForm } from '@/components/stations/dispenser-form'
import { StationFuelAreaForm } from '@/components/stations/station-fuel-area-form'
import { Badge } from '@/components/ui/badge'
import { requireStationAccess } from '@/lib/auth/station-guard'
import { tankNumberFrom } from '@/lib/dispensers/naming'
import { addableFuels, fuelTypeLabelFrom, stationFuels } from '@/lib/fuels/catalogue'
import { loadFuelCatalogue } from '@/lib/fuels/load-catalogue'
import { prisma } from '@/lib/prisma'
import { cn } from '@/lib/utils'
import { vi } from '@/messages/vi'

/** The đồng hồ a trụ carries, as its row reads them out. */
function meterSummary(dispenser: { hasElectronicMeter: boolean; hasMechanicalMeter: boolean }) {
  const meters = [
    ...(dispenser.hasElectronicMeter ? [vi.dispensers.electronicMeter] : []),
    ...(dispenser.hasMechanicalMeter ? [vi.dispensers.mechanicalMeter] : []),
  ]
  return meters.length === 0 ? vi.dispensers.noMeter : meters.join(', ')
}

export default async function StationConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireStationAccess(id)

  const station = await prisma.station.findUnique({ where: { id } })
  if (!station) notFound()

  const [entries, dispensers] = await Promise.all([
    prisma.misaFuelMap.findMany({ where: { stationId: id } }),
    // Trụ đã ngừng are here too: this is the trạm's own list of what it lắp, not an ô
    // chọn, and Dùng lại is reachable only from the row of a trụ that is retired.
    prisma.dispenser.findMany({ where: { stationId: id }, orderBy: { displayOrder: 'asc' } }),
  ])
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
  // A trụ pumps what the trạm declared it sells, so Thêm trụ and Chỉnh sửa both draw
  // their ô chọn from the Map nhiên liệu rows above and the two can never disagree.
  const sold = stationFuels(catalogue, [...byFuel.keys()])

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

      <section className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium">{vi.dispensers.title}</h2>
            <p className="text-muted-foreground text-sm">{vi.dispensers.note}</p>
          </div>
          <DispenserForm stationId={id} fuels={sold} />
        </div>

        {dispensers.length === 0 ? (
          // Thêm trụ is disabled with nothing to pump, so the empty state says why
          // rather than leaving a dead button to be puzzled over.
          <p className="text-muted-foreground text-sm">
            {sold.length === 0 ? vi.dispensers.emptyNoFuels : vi.dispensers.empty}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="p-2">{vi.dispensers.pump}</th>
                <th className="p-2">{vi.misaSettings.fuel}</th>
                <th className="p-2">{vi.dispensers.tank}</th>
                <th className="p-2">{vi.dispensers.tankCapacity}</th>
                <th className="p-2">{vi.dispensers.meters}</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {dispensers.map((dispenser) => {
                // Read once, so the row and the form it opens name the same hầm — a
                // second reading of the code could only disagree with this one.
                const tankNumber = tankNumberFrom(dispenser.tankCode)
                return (
                  <tr
                    key={dispenser.id}
                    className={cn('border-b', !dispenser.isActive && 'text-muted-foreground')}
                  >
                    <td className="p-2">
                      {dispenser.displayName}
                      {!dispenser.isActive && (
                        <Badge variant="secondary" className="ml-2 font-normal">
                          {vi.dispensers.inactive}
                        </Badge>
                      )}
                    </td>
                    <td className="p-2">{fuelTypeLabelFrom(catalogue, dispenser.fuelType)}</td>
                    <td className="readout p-2">
                      {tankNumber === null ? '—' : `${vi.dispensers.tank} ${tankNumber}`}
                    </td>
                    <td className="readout p-2">
                      {dispenser.tankCapacityK === null ? '—' : `${dispenser.tankCapacityK}K`}
                    </td>
                    <td className="p-2">{meterSummary(dispenser)}</td>
                    <td className="p-2 text-right">
                      <DispenserForm
                        stationId={id}
                        fuels={sold}
                        dispenser={{
                          id: dispenser.id,
                          displayName: dispenser.displayName,
                          fuel: {
                            fuelType: dispenser.fuelType,
                            name: fuelTypeLabelFrom(catalogue, dispenser.fuelType),
                          },
                          tankNumber,
                          tankCapacityK: dispenser.tankCapacityK,
                          hasElectronicMeter: dispenser.hasElectronicMeter,
                          hasMechanicalMeter: dispenser.hasMechanicalMeter,
                          isActive: dispenser.isActive,
                        }}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
