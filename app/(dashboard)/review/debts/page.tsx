import { VisitReview } from '@/components/debts/visit-review'
import { requireUser } from '@/lib/auth/session'
import { formatLiters, formatVND } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

export default async function ReviewDebtsPage() {
  await requireUser()
  const [visits, customers] = await Promise.all([
    prisma.debtVehicleVisit.findMany({
      where: { reviewStatus: { in: ['pending', 'needs_review'] } },
      orderBy: { visitDate: 'desc' },
      take: 100,
    }),
    prisma.debtCustomer.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{vi.review.debtsTitle}</h1>
      {visits.length === 0 ? (
        <p className="text-muted-foreground text-sm">{vi.review.empty}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th className="p-2">{vi.debts.plate}</th>
              <th className="p-2 text-right">{vi.debts.liters}</th>
              <th className="p-2 text-right">{vi.debts.amount}</th>
              <th className="p-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {visits.map((visit) => (
              <tr key={visit.id} className="border-b align-middle">
                <td className="p-2">{visit.plateConfirmed ?? visit.plateRead ?? '—'}</td>
                <td className="p-2 text-right font-mono">
                  {visit.litersRead !== null ? formatLiters(Number(visit.litersRead)) : '—'}
                </td>
                <td className="p-2 text-right font-mono">
                  {visit.computedAmount !== null ? formatVND(Number(visit.computedAmount)) : '—'}
                </td>
                <td className="p-2 text-right">
                  <VisitReview
                    data={{
                      visitId: visit.id,
                      plate: visit.plateConfirmed ?? visit.plateRead ?? '',
                      liters: visit.litersRead !== null ? visit.litersRead.toString() : '',
                      unitPrice: visit.unitPriceRead !== null ? visit.unitPriceRead.toString() : '',
                      customerId: visit.customerId ?? '',
                      customers,
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
