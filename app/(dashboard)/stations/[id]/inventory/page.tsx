import { MovementForm } from '@/components/inventory/movement-form'
import { StatusBadge } from '@/components/shared/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUser } from '@/lib/auth/session'
import { formatDate, formatLiters } from '@/lib/format'
import { isLowStock } from '@/lib/inventory/stock-calculator'
import { prisma } from '@/lib/prisma'
import { fuelTypeLabel } from '@/lib/ui/status'
import { vi } from '@/messages/vi'

export default async function StationInventoryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireUser()
  const { id } = await params
  const [balances, dips] = await Promise.all([
    prisma.inventoryBalance.findMany({
      where: { stationId: id },
      orderBy: { fuelType: 'asc' },
    }),
    prisma.tankDipRecord.findMany({
      where: { stationId: id },
      orderBy: { measuredAt: 'desc' },
      take: 40,
    }),
  ])
  // Latest measurement per tank (dips are ordered newest-first).
  const latestByTank = new Map<string, (typeof dips)[number]>()
  for (const dip of dips) {
    if (!latestByTank.has(dip.tankCode)) latestByTank.set(dip.tankCode, dip)
  }
  const tankRows = [...latestByTank.values()].sort((a, b) => a.tankCode.localeCompare(b.tankCode))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-muted-foreground text-sm font-medium">{vi.inventory.title}</h2>
        <MovementForm stationId={id} />
      </div>
      {balances.length === 0 ? (
        <p className="text-muted-foreground text-sm">{vi.inventory.empty}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {balances.map((balance) => {
            const estimated = Number(balance.estimatedStock)
            const threshold = balance.lowThreshold !== null ? Number(balance.lowThreshold) : null
            const low = isLowStock(estimated, threshold)
            return (
              <Card key={balance.id}>
                <CardHeader className="flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base">{fuelTypeLabel(balance.fuelType)}</CardTitle>
                  {low && <StatusBadge label={vi.inventory.low} tone="danger" />}
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{vi.inventory.estimated}</span>
                    <span className="font-mono">{formatLiters(estimated)}</span>
                  </div>
                  {balance.lastPhysicalStock !== null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{vi.inventory.physical}</span>
                      <span className="font-mono">
                        {formatLiters(Number(balance.lastPhysicalStock))}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <section className="space-y-2">
        <h3 className="text-muted-foreground text-sm font-medium">{vi.inventory.tankDips}</h3>
        {tankRows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{vi.inventory.noDips}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="p-2">{vi.inventory.tank}</th>
                <th className="p-2">{vi.inventory.fuelType}</th>
                <th className="p-2 text-right">{vi.inventory.dipValue}</th>
                <th className="p-2 text-right">{vi.inventory.dipDelta}</th>
                <th className="p-2">{vi.inventory.measuredAt}</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {tankRows.map((dip) => (
                <tr key={dip.id} className="border-b">
                  <td className="p-2 font-medium">{dip.tankCode.replace('HAM_', 'Hầm ')}</td>
                  <td className="p-2">{dip.fuelType ? fuelTypeLabel(dip.fuelType) : '—'}</td>
                  <td className="p-2 text-right font-mono">{dip.dipValue.toString()}</td>
                  <td className="p-2 text-right font-mono">
                    {dip.deltaFromPrevious === null ? '—' : dip.deltaFromPrevious.toString()}
                  </td>
                  <td className="p-2">{formatDate(dip.measuredAt)}</td>
                  <td className="space-x-1 p-2">
                    {dip.isReserve && <StatusBadge label={vi.inventory.reserve} tone="muted" />}
                    {dip.isAnomaly && (
                      <StatusBadge label={vi.inventory.reserveChanged} tone="danger" />
                    )}
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
