import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUser } from '@/lib/auth/session'
import { formatVND } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

function SummaryCard({ title, value }: { title: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-2xl font-semibold">{value}</CardContent>
    </Card>
  )
}

export default async function StationOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id } = await params

  const shiftIds = (
    await prisma.shift.findMany({ where: { stationId: id }, select: { id: true } })
  ).map((s) => s.id)

  const [pendingReviews, expiringDocs, balances, customers] = await Promise.all([
    shiftIds.length
      ? prisma.shiftReading.count({
          where: { shiftId: { in: shiftIds }, reviewStatus: { in: ['pending', 'needs_review'] } },
        })
      : Promise.resolve(0),
    prisma.stationDocument.count({
      where: { stationId: id, status: { in: ['expiring_soon', 'expired'] } },
    }),
    prisma.inventoryBalance.findMany({ where: { stationId: id } }),
    prisma.debtCustomer.findMany({ where: { stationId: id, isActive: true } }),
  ])

  const lowStock = balances.filter(
    (b) => b.lowThreshold !== null && Number(b.estimatedStock) <= Number(b.lowThreshold)
  ).length
  const debtTotal = customers.reduce((sum, c) => sum + Number(c.currentBalance), 0)

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <SummaryCard title={vi.overview.pendingReviews} value={pendingReviews} />
      <SummaryCard title={vi.overview.expiringDocs} value={expiringDocs} />
      <SummaryCard title={vi.overview.lowStock} value={lowStock} />
      <SummaryCard title={vi.debts.balance} value={formatVND(debtTotal)} />
    </div>
  )
}
