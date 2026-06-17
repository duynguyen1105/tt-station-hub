import { PaymentForm } from '@/components/debts/payment-form'
import { requireUser } from '@/lib/auth/session'
import { formatVND } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

export default async function StationDebtsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id } = await params
  const customers = await prisma.debtCustomer.findMany({
    where: { stationId: id, isActive: true },
    orderBy: { name: 'asc' },
  })

  if (customers.length === 0) {
    return <p className="text-muted-foreground text-sm">{vi.debts.empty}</p>
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-muted-foreground border-b text-left">
          <th className="p-2">{vi.debts.customer}</th>
          <th className="p-2 text-right">{vi.debts.balance}</th>
          <th className="p-2"></th>
        </tr>
      </thead>
      <tbody>
        {customers.map((customer) => (
          <tr key={customer.id} className="border-b">
            <td className="p-2">{customer.name}</td>
            <td className="p-2 text-right font-mono">
              {formatVND(Number(customer.currentBalance))}
            </td>
            <td className="p-2 text-right">
              <PaymentForm customerId={customer.id} customerName={customer.name} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
