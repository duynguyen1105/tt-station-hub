import { type ComponentProps } from 'react'

import { notFound } from 'next/navigation'

import { MisaFuelMapForm } from '@/components/misa-export/fuel-map-form'
import { DispenserForm, type DispenserRow } from '@/components/stations/dispenser-form'
import { StationFuelAreaForm } from '@/components/stations/station-fuel-area-form'
import { TankForm } from '@/components/stations/tank-form'
import { Badge } from '@/components/ui/badge'
import { requireStationAccess } from '@/lib/auth/station-guard'
import { tankNameFor, tankNumberFrom } from '@/lib/dispensers/naming'
import { addableFuels, fuelTypeLabelFrom, stationFuels } from '@/lib/fuels/catalogue'
import { loadFuelCatalogue } from '@/lib/fuels/load-catalogue'
import { prisma } from '@/lib/prisma'
import { cn } from '@/lib/utils'
import { vi } from '@/messages/vi'

/** The đồng hồ a trụ carries, as its row reads them out. */
function meterSummary(dispenser: DispenserRow) {
  return [
    ...(dispenser.hasElectronicMeter ? [vi.dispensers.electronicMeter] : []),
    ...(dispenser.hasMechanicalMeter ? [vi.dispensers.mechanicalMeter] : []),
  ].join(', ')
}

/** Hầm 2 before Hầm 10: by số hầm, then by code for one carrying no số. */
function byTankNumber(a: { code: string }, b: { code: string }) {
  const numberA = tankNumberFrom(a.code) ?? Infinity
  const numberB = tankNumberFrom(b.code) ?? Infinity
  return numberA === numberB ? a.code.localeCompare(b.code) : numberA - numberB
}

export default async function StationConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireStationAccess(id)
  // Người xem reads the cấu hình; every control that writes is left out for them.
  const canEdit = user.role !== 'viewer'

  const station = await prisma.station.findUnique({ where: { id } })
  if (!station) notFound()

  const [entries, tankRecords, dispensers] = await Promise.all([
    prisma.misaFuelMap.findMany({ where: { stationId: id } }),
    prisma.tank.findMany({ where: { stationId: id } }),
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
  // A hầm holds what the trạm declared it sells, so Thêm hầm and Chỉnh sửa both draw
  // their ô chọn from the Map nhiên liệu rows above and the two can never disagree —
  // and so does a trụ with no hầm, the only trụ that picks a nhiên liệu of its own.
  const sold = stationFuels(catalogue, [...byFuel.keys()])

  const fuelOf = (fuelType: string) => ({
    fuelType,
    name: fuelTypeLabelFrom(catalogue, fuelType),
  })
  const tanks = tankRecords.sort(byTankNumber).map((tank) => ({
    id: tank.id,
    name: tankNameFor(tank.code),
    fuel: fuelOf(tank.fuelType),
    capacityK: tank.capacityK,
    dispensers: dispensers.filter((d) => d.tankId === tank.id),
  }))
  const untanked = dispensers.filter((d) => d.tankId === null)
  // What the trụ form's ô chọn needs, and nothing that cannot cross to the client: the
  // trụ rows above carry Decimal đồng hồ caches.
  const tankOptions = tanks.map(({ id: tankId, name, fuel, capacityK }) => ({
    id: tankId,
    name,
    fuel,
    capacityK,
  }))

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <div>
          <h2 className="text-sm font-medium">{vi.misaSettings.fuelAreaLabel}</h2>
          <p className="text-muted-foreground text-sm">{vi.misaSettings.fuelAreaNote}</p>
        </div>
        {canEdit ? (
          <StationFuelAreaForm stationId={id} fuelArea={station.fuelArea} />
        ) : (
          <p className="text-sm">{vi.fuelArea[station.fuelArea]}</p>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium">{vi.misaSettings.fuelMap}</h2>
            <p className="text-muted-foreground text-sm">{vi.misaSettings.fuelMapNote}</p>
          </div>
          {canEdit && <MisaFuelMapForm stationId={id} addable={addable} />}
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
                    {canEdit && (
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
                    )}
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
          {/* A trụ is added from the menu of the hầm it draws from. */}
          {canEdit && <TankForm stationId={id} fuels={sold} tanks={tankOptions} />}
        </div>

        {tanks.length === 0 && untanked.length === 0 ? (
          // Thêm hầm is disabled with nothing to hold, so the empty state says why
          // rather than leaving a dead button to be puzzled over.
          <p className="text-muted-foreground text-sm">
            {sold.length === 0 ? vi.dispensers.emptyNoFuels : vi.dispensers.empty}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="p-2">{vi.tanks.column}</th>
                <th className="p-2">{vi.misaSettings.fuel}</th>
                <th className="p-2">{vi.tanks.capacity}</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            {/* One tbody per hầm: its own row, then the trụ drawing from it. The trụ rows
                leave nhiên liệu and dung tích blank — both are the hầm's, read above. */}
            {tanks.map((tank) => (
              <tbody key={tank.id}>
                <tr className="bg-muted/40 border-b font-medium">
                  <td className="p-2">{tank.name}</td>
                  <td className="p-2">{tank.fuel.name}</td>
                  <td className="readout p-2">
                    {tank.capacityK === null ? '—' : `${tank.capacityK}K`}
                  </td>
                  <td className="p-2 text-right">
                    {canEdit && (
                      <TankForm
                        stationId={id}
                        fuels={sold}
                        tanks={tankOptions}
                        tank={{
                          id: tank.id,
                          name: tank.name,
                          fuel: tank.fuel,
                          capacityK: tank.capacityK,
                          dispenserNames: tank.dispensers.map((d) => d.displayName),
                        }}
                      />
                    )}
                  </td>
                </tr>
                {tank.dispensers.length === 0 ? (
                  <tr className="border-b">
                    <td colSpan={4} className="text-muted-foreground p-2 pl-8">
                      {vi.tanks.noDispensers}
                    </td>
                  </tr>
                ) : (
                  tank.dispensers.map((dispenser) => (
                    <DispenserTableRow
                      key={dispenser.id}
                      stationId={id}
                      fuels={sold}
                      tanks={tankOptions}
                      dispenser={{ ...dispenser, fuel: fuelOf(dispenser.fuelType) }}
                      canEdit={canEdit}
                    />
                  ))
                )}
              </tbody>
            ))}
            {untanked.length > 0 && (
              <tbody>
                <tr className="bg-muted/40 border-b font-medium">
                  <td className="p-2" colSpan={4}>
                    {vi.dispensers.noTank}
                  </td>
                </tr>
                {untanked.map((dispenser) => (
                  <DispenserTableRow
                    key={dispenser.id}
                    stationId={id}
                    fuels={sold}
                    tanks={tankOptions}
                    dispenser={{ ...dispenser, fuel: fuelOf(dispenser.fuelType) }}
                    canEdit={canEdit}
                    showFuel
                  />
                ))}
              </tbody>
            )}
          </table>
        )}
      </section>
    </div>
  )
}

/**
 * One trụ under its hầm, with the đồng hồ it carries beside its tên. Only a trụ with no
 * hầm shows a nhiên liệu — under a hầm, the nhiên liệu is the hầm's and is read on the
 * hầm's row.
 */
function DispenserTableRow({
  stationId,
  fuels,
  tanks,
  dispenser,
  canEdit,
  showFuel = false,
}: Pick<ComponentProps<typeof DispenserForm>, 'stationId' | 'fuels' | 'tanks'> & {
  dispenser: DispenserRow
  canEdit: boolean
  showFuel?: boolean
}) {
  return (
    <tr className={cn('border-b', !dispenser.isActive && 'text-muted-foreground')}>
      <td className="p-2 pl-8">
        {dispenser.displayName}
        {!dispenser.isActive && (
          <Badge variant="secondary" className="ml-2 font-normal">
            {vi.dispensers.inactive}
          </Badge>
        )}
        <span className="text-muted-foreground ml-3">{meterSummary(dispenser)}</span>
      </td>
      <td className="p-2">{showFuel && dispenser.fuel.name}</td>
      <td className="p-2"></td>
      <td className="p-2 text-right">
        {canEdit && (
          <DispenserForm
            stationId={stationId}
            fuels={fuels}
            tanks={tanks}
            dispenser={{
              id: dispenser.id,
              displayName: dispenser.displayName,
              fuel: dispenser.fuel,
              tankId: dispenser.tankId,
              hasElectronicMeter: dispenser.hasElectronicMeter,
              hasMechanicalMeter: dispenser.hasMechanicalMeter,
              isActive: dispenser.isActive,
            }}
          />
        )}
      </td>
    </tr>
  )
}
