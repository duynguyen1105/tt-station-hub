import { MisaConfigForm } from '@/components/misa-export/config-form'
import { StationSelect } from '@/components/misa-export/station-select'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

export default async function MisaConfigPage({
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

  const config = await prisma.misaStationConfig.findUnique({ where: { stationId } })

  const rows = [
    { label: vi.misaSettings.revenueAccount, value: config?.revenueAccount },
    { label: vi.misaSettings.costAccount, value: config?.costAccount },
    { label: vi.misaSettings.stockAccount, value: config?.stockAccount },
    { label: vi.misaSettings.creditDebitAccount, value: config?.creditDebitAccount },
    { label: vi.misaSettings.cashDebitAccount, value: config?.cashDebitAccount },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <StationSelect stations={stations} value={stationId} />
        <MisaConfigForm stationId={stationId} config={config} />
      </div>

      {config === null ? (
        <p className="text-muted-foreground text-sm">{vi.misaSettings.noConfig}</p>
      ) : (
        <dl className="divide-y text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between py-2">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="readout">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
