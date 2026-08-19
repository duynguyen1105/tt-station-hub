import { notFound } from 'next/navigation'

import { MisaFuelMapForm } from '@/components/misa-export/fuel-map-form'
import { StationFuelAreaForm } from '@/components/stations/station-fuel-area-form'
import { requireStationAccess } from '@/lib/auth/station-guard'
import { prisma } from '@/lib/prisma'
import { fuelTypeLabel } from '@/lib/ui/status'
import { vi } from '@/messages/vi'

export default async function StationConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireStationAccess(id)

  const station = await prisma.station.findUnique({ where: { id } })
  if (!station) notFound()

  const entries = await prisma.misaFuelMap.findMany({ where: { stationId: id } })
  const byFuel = new Map(entries.map((e) => [e.fuelType, e]))

  const fuelTypes = Object.keys(vi.fuelType)

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
        <div>
          <h2 className="text-sm font-medium">{vi.misaSettings.fuelMap}</h2>
          <p className="text-muted-foreground text-sm">{vi.misaSettings.fuelMapNote}</p>
        </div>

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
                      stationId={id}
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
      </section>
    </div>
  )
}
