import Link from 'next/link'

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

export default async function OverviewPage() {
  await requireUser()

  const [stations, pendingReadings, shifts, expiringDocs, balances, customers] = await Promise.all([
    prisma.station.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } }),
    prisma.shiftReading.findMany({
      where: { reviewStatus: { in: ['pending', 'needs_review'] } },
      select: { shiftId: true },
    }),
    prisma.shift.findMany({ select: { id: true, stationId: true } }),
    prisma.stationDocument.findMany({
      where: { status: { in: ['expiring_soon', 'expired'] } },
      select: { stationId: true },
    }),
    prisma.inventoryBalance.findMany({
      select: { stationId: true, estimatedStock: true, lowThreshold: true },
    }),
    prisma.debtCustomer.findMany({
      where: { isActive: true },
      select: { stationId: true, currentBalance: true },
    }),
  ])

  const stationOfShift = new Map(shifts.map((s) => [s.id, s.stationId]))
  const tally = (key: string, map: Map<string, number>) => map.set(key, (map.get(key) ?? 0) + 1)

  const pendingByStation = new Map<string, number>()
  for (const r of pendingReadings) {
    const stationId = stationOfShift.get(r.shiftId)
    if (stationId) tally(stationId, pendingByStation)
  }
  const expiringByStation = new Map<string, number>()
  for (const d of expiringDocs) tally(d.stationId, expiringByStation)

  const lowByStation = new Map<string, number>()
  for (const b of balances) {
    if (b.lowThreshold !== null && Number(b.estimatedStock) <= Number(b.lowThreshold)) {
      tally(b.stationId, lowByStation)
    }
  }
  const debtByStation = new Map<string, number>()
  for (const c of customers) {
    if (c.stationId) {
      debtByStation.set(
        c.stationId,
        (debtByStation.get(c.stationId) ?? 0) + Number(c.currentBalance)
      )
    }
  }

  const totalPending = pendingReadings.length
  const totalExpiring = expiringDocs.length
  const totalLow = [...lowByStation.values()].reduce((a, b) => a + b, 0)
  const totalDebt = [...debtByStation.values()].reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{vi.overview.title}</h1>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title={vi.overview.pendingReviews} value={totalPending} />
        <SummaryCard title={vi.overview.expiringDocs} value={totalExpiring} />
        <SummaryCard title={vi.overview.lowStock} value={totalLow} />
        <SummaryCard title={vi.overview.overdueDebts} value={formatVND(totalDebt)} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th className="p-2">{vi.review.station}</th>
              <th className="p-2 text-right">{vi.overview.pendingReviews}</th>
              <th className="p-2 text-right">{vi.overview.expiringDocs}</th>
              <th className="p-2 text-right">{vi.overview.lowStock}</th>
              <th className="p-2 text-right">{vi.debts.balance}</th>
            </tr>
          </thead>
          <tbody>
            {stations.map((station) => (
              <tr key={station.id} className="border-b">
                <td className="p-2">
                  <Link href={`/stations/${station.id}`} className="text-primary hover:underline">
                    {station.name}
                  </Link>
                </td>
                <td className="p-2 text-right">{pendingByStation.get(station.id) ?? 0}</td>
                <td className="p-2 text-right">{expiringByStation.get(station.id) ?? 0}</td>
                <td className="p-2 text-right">{lowByStation.get(station.id) ?? 0}</td>
                <td className="p-2 text-right font-mono">
                  {formatVND(debtByStation.get(station.id) ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
