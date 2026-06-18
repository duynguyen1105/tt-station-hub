import Link from 'next/link'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUser } from '@/lib/auth/session'
import { formatVND } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { cn } from '@/lib/utils'
import { vi } from '@/messages/vi'

function SummaryCard({ title, value }: { title: string; value: string | number }) {
  return (
    <Card className="relative overflow-hidden">
      <span className="bg-brass absolute inset-x-0 top-0 h-1" />
      <CardHeader className="pt-5 pb-1">
        <CardTitle className="label-micro">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <span className="readout text-foreground text-3xl font-bold">{value}</span>
      </CardContent>
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
      <div>
        <p className="label-micro">Tổng quan vận hành</p>
        <h1 className="text-2xl font-bold tracking-tight">{vi.overview.title}</h1>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title={vi.overview.pendingReviews} value={totalPending} />
        <SummaryCard title={vi.overview.expiringDocs} value={totalExpiring} />
        <SummaryCard title={vi.overview.lowStock} value={totalLow} />
        <SummaryCard title={vi.overview.overdueDebts} value={formatVND(totalDebt)} />
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="border-b text-left">
              <th className="label-micro px-3 py-2.5">{vi.review.station}</th>
              <th className="label-micro px-3 py-2.5 text-right">{vi.overview.pendingReviews}</th>
              <th className="label-micro px-3 py-2.5 text-right">{vi.overview.expiringDocs}</th>
              <th className="label-micro px-3 py-2.5 text-right">{vi.overview.lowStock}</th>
              <th className="label-micro px-3 py-2.5 text-right">{vi.debts.balance}</th>
            </tr>
          </thead>
          <tbody>
            {stations.map((station) => {
              const pending = pendingByStation.get(station.id) ?? 0
              const expiring = expiringByStation.get(station.id) ?? 0
              const low = lowByStation.get(station.id) ?? 0
              return (
                <tr
                  key={station.id}
                  className="hover:bg-muted/40 border-b transition-colors last:border-0"
                >
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/stations/${station.id}`}
                      className="text-primary font-medium hover:underline"
                    >
                      {station.name}
                    </Link>
                  </td>
                  <td
                    className={cn(
                      'readout px-3 py-2.5 text-right',
                      pending > 0 ? 'font-semibold text-amber-600 dark:text-amber-400' : ''
                    )}
                  >
                    {pending}
                  </td>
                  <td
                    className={cn(
                      'readout px-3 py-2.5 text-right',
                      expiring > 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : ''
                    )}
                  >
                    {expiring}
                  </td>
                  <td
                    className={cn(
                      'readout px-3 py-2.5 text-right',
                      low > 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : ''
                    )}
                  >
                    {low}
                  </td>
                  <td className="readout px-3 py-2.5 text-right">
                    {formatVND(debtByStation.get(station.id) ?? 0)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
