import Link from 'next/link'

import { CustomerMisaCode } from '@/components/shared/customer-misa-code'
import { PhotoView } from '@/components/shared/photo-view'
import { StatusBadge } from '@/components/shared/status-badge'
import { formatLiters, formatVND } from '@/lib/format'
import { type DebtListRow } from '@/lib/misa-export/debts-list'
import { stationSlug } from '@/lib/stations/href'
import { vi } from '@/messages/vi'

/**
 * Bán nợ trong ca: the ca's ngày's duyệt'd lượt bán nợ, read-only — each is sửa'd on
 * its Duyệt công nợ card, which `editHref` points at where this user may.
 */
export function ShiftDebtSales({
  stationCode,
  rows,
  pendingCount,
}: {
  stationCode: string
  rows: (DebtListRow & { editHref: string | null })[]
  /** The ngày's lượt bán nợ still in Duyệt công nợ, not in this list yet. */
  pendingCount: number
}) {
  return (
    <section id="ban-no" className="scroll-mt-28 space-y-2">
      <h3 className="text-base font-semibold">{vi.shifts.debtsSectionTitle}</h3>
      {pendingCount > 0 && (
        <p className="text-sm text-amber-700">
          {vi.shifts.pendingDebtsNote(pendingCount)}{' '}
          <Link
            href={`/review/debts?station=${stationSlug(stationCode)}`}
            className="underline print:hidden"
          >
            {vi.shifts.pendingDebtsLink}
          </Link>
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{vi.shifts.debtsEmpty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="p-2">{vi.shifts.debtId}</th>
                <th className="p-2 print:hidden">{vi.shifts.debtPhotos}</th>
                <th className="p-2">{vi.shifts.debtCustomer}</th>
                <th className="p-2">{vi.shifts.debtFuel}</th>
                <th className="p-2 text-right">{vi.shifts.debtLiters}</th>
                <th className="p-2 text-right">{vi.shifts.debtAmount}</th>
                <th className="p-2 print:hidden"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-b">
                  <td className="p-2 font-mono">
                    {row.idIsMissing ? (
                      <StatusBadge label={vi.debtReview.missingCode} tone="danger" />
                    ) : (
                      row.id
                    )}
                  </td>
                  <td className="p-2 print:hidden">
                    <span className="inline-flex gap-1">
                      <PhotoView url={row.vehiclePhotoUrl} label={vi.debtReview.vehiclePhoto} />
                      <PhotoView url={row.meterPhotoUrl} label={vi.debtReview.meterPhoto} />
                    </span>
                  </td>
                  <td className="p-2">
                    {row.customerName && (
                      <CustomerMisaCode misaCode={row.customerMisaCode} name={row.customerName} />
                    )}
                  </td>
                  <td className="p-2">{row.fuelLabel}</td>
                  <td className="p-2 text-right font-mono">{formatLiters(row.liters)}</td>
                  <td className="p-2 text-right font-mono whitespace-nowrap">
                    {row.amount === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      formatVND(row.amount)
                    )}
                  </td>
                  <td className="p-2 text-right print:hidden">
                    {row.editHref && (
                      // A full load, not <Link>: :target (the card's ring) only follows a real navigation.
                      <a href={row.editHref} className="text-primary underline">
                        {vi.shifts.debtEdit}
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                {/* Split so the printed sheet, which drops the Ảnh column, keeps Tổng under Số tiền. */}
                <td></td>
                <td className="print:hidden"></td>
                <td className="p-2 text-right" colSpan={3}>
                  {vi.shifts.sumTotal}
                </td>
                <td className="p-2 text-right font-mono whitespace-nowrap">
                  {formatVND(rows.reduce((sum, r) => sum + (r.amount ?? 0), 0))}
                </td>
                <td className="print:hidden"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}
