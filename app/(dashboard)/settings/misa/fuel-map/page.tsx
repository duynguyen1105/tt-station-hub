import { MisaFuelMapForm } from '@/components/misa-export/fuel-map-form'
import { StationSelect } from '@/components/misa-export/station-select'
import { prisma } from '@/lib/prisma'
import { fuelTypeLabel } from '@/lib/ui/status'
import { vi } from '@/messages/vi'

export default async function MisaFuelMapPage({
  searchParams,
}: {
  searchParams: Promise<{ station?: string }>
}) {
  const { station } = await searchParams
  const stations = await prisma.station.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true },
  })

  const first = stations[0]
  if (!first) {
    return <p className="text-muted-foreground text-sm">{vi.misaSettings.noStations}</p>
  }

  const stationId = stations.some((s) => s.id === station) ? station! : first.id

  const entries = await prisma.misaFuelMap.findMany({ where: { stationId } })
  const byFuel = new Map(entries.map((e) => [e.fuelType, e]))

  const fuelTypes = Object.keys(vi.fuelType)

  return (
    <div className="space-y-4">
      <StationSelect stations={stations} value={stationId} />

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
          {fuelTypes.map((fuelType) => {
            const entry = byFuel.get(fuelType) ?? null
            return (
              <tr key={fuelType} className="border-b">
                <td className="p-2">{fuelTypeLabel(fuelType)}</td>
                <td className="readout p-2">{entry?.productCode ?? '—'}</td>
                <td className="readout p-2">{entry?.productName ?? '—'}</td>
                <td className="readout p-2">{entry?.warehouseCode ?? '—'}</td>
                <td className="readout p-2">{entry?.unit ?? '—'}</td>
                <td className="p-2 text-right">
                  <MisaFuelMapForm
                    stationId={stationId}
                    fuelType={fuelType}
                    entry={
                      entry && {
                        productCode: entry.productCode,
                        productName: entry.productName,
                        warehouseCode: entry.warehouseCode,
                        unit: entry.unit,
                      }
                    }
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
