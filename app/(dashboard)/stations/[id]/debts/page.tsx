import { CustomerForm } from '@/components/debts/customer-form'
import { CustomerMisaForm } from '@/components/debts/customer-misa-form'
import { PaymentForm } from '@/components/debts/payment-form'
import { Button } from '@/components/ui/button'
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

  const addButton = (
    <CustomerForm
      stationId={id}
      trigger={<Button size="sm">+ {vi.debtReview.addCustomer}</Button>}
    />
  )

  if (customers.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">{addButton}</div>
        <p className="text-muted-foreground text-sm">{vi.debts.empty}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">{addButton}</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left">
            <th className="p-2">{vi.debts.customer}</th>
            <th className="p-2">{vi.debts.plate}</th>
            <th className="p-2">{vi.debts.misaCode}</th>
            <th className="p-2 text-right">{vi.debts.balance}</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => (
            <tr key={customer.id} className="border-b">
              <td className="p-2">
                <div className="font-medium">{customer.name}</div>
                {customer.phone && (
                  <div className="text-muted-foreground text-xs">{customer.phone}</div>
                )}
              </td>
              <td className="p-2 font-mono text-xs">
                {customer.knownPlates.length ? customer.knownPlates.join(', ') : '—'}
              </td>
              <td className="p-2 font-mono">{customer.misaCode ?? '—'}</td>
              <td className="p-2 text-right font-mono">
                {formatVND(Number(customer.currentBalance))}
              </td>
              <td className="p-2 text-right whitespace-nowrap">
                <CustomerForm
                  customer={{
                    id: customer.id,
                    name: customer.name,
                    phone: customer.phone,
                    misaCode: customer.misaCode,
                    knownPlates: customer.knownPlates,
                  }}
                  trigger={
                    <Button size="sm" variant="ghost">
                      {vi.common.edit}
                    </Button>
                  }
                />
                <CustomerMisaForm
                  customerId={customer.id}
                  customerName={customer.name}
                  misaCode={customer.misaCode}
                />
                <PaymentForm customerId={customer.id} customerName={customer.name} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
