import { CustomerForm } from '@/components/debts/customer-form'
import { CustomerList } from '@/components/debts/customer-list'
import { Button } from '@/components/ui/button'
import { requireStationAccess } from '@/lib/auth/station-guard'
import { debtCustomerFilter } from '@/lib/debts/customer-search'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

export default async function StationDebtsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ q?: string; owing?: string }>
}) {
  const { id } = await params
  await requireStationAccess(id)
  const customers = await prisma.debtCustomer.findMany({
    where: { stationId: id, isActive: true },
    // Only what the table prints: everything selected here crosses to the browser.
    select: {
      id: true,
      name: true,
      phone: true,
      misaCode: true,
      knownPlates: true,
      currentBalance: true,
    },
    orderBy: { name: 'asc' },
  })

  const addButton = (
    <CustomerForm
      stationId={id}
      trigger={<Button size="sm">+ {vi.debtReview.addCustomer}</Button>}
    />
  )

  // A trạm with no khách hàng at all has nothing to filter, so it keeps its own
  // empty state rather than reading as a bộ lọc that matched nothing.
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
      <CustomerList
        // Dư nợ is a Decimal, which doesn't cross to a client component — and the
        // table wants a number anyway.
        customers={customers.map(({ currentBalance, ...rest }) => ({
          ...rest,
          balance: Number(currentBalance),
        }))}
        initialFilter={debtCustomerFilter(await searchParams)}
      />
    </div>
  )
}
