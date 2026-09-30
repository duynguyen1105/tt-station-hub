import { formatVND } from '@/lib/format'
import { vi } from '@/messages/vi'

/**
 * The phiếu chốt ca's headline figures in one strip at the top, each the same total
 * its own section below prints, so the ca reads at a glance without scrolling.
 */
export function ShiftSummary({
  sales,
  debtSales,
  receipts,
  payments,
  closingCash,
}: {
  sales: number
  debtSales: number
  receipts: number
  payments: number
  /** Null where Tồn tiền mặt cannot be worked out (no đầu kỳ yet). */
  closingCash: number | null
}) {
  const t = vi.shifts.summary
  const items = [
    { label: t.sales, value: sales },
    { label: t.debtSales, value: debtSales },
    { label: t.receipts, value: receipts },
    { label: t.payments, value: payments },
    { label: t.closingCash, value: closingCash },
  ]
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 print:grid-cols-5">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border p-3">
          <dt className="text-muted-foreground text-xs">{item.label}</dt>
          <dd className="font-mono text-base font-semibold whitespace-nowrap">
            {item.value === null ? '—' : formatVND(item.value)}
          </dd>
        </div>
      ))}
    </dl>
  )
}
