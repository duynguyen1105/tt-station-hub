import { MovementForm } from '@/components/inventory/movement-form'
import { StatusBadge } from '@/components/shared/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUser } from '@/lib/auth/session'
import { formatLiters } from '@/lib/format'
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
  const balances = await prisma.inventoryBalance.findMany({
    where: { stationId: id },
    orderBy: { fuelType: 'asc' },
  })

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
    </div>
  )
}
