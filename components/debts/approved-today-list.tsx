import Link from 'next/link'

import type { ApprovedTodayRow } from '@/lib/debts/approved-today'
import { formatLiters, vnTime } from '@/lib/format'
import { vi } from '@/messages/vi'

/**
 * A quick link from today's approvals back to their ca. Admins can edit decided
 * visits in the separate Đã xử lý view; this summary stays read-only.
 */
export function ApprovedTodayList({ rows }: { rows: ApprovedTodayRow[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">
        {vi.debtReview.approvedToday} ({rows.length})
      </h2>
      {rows.length === 0 ? (
        // The normal morning state, not a fault: nothing has been duyệt'd yet.
        <p className="text-muted-foreground text-sm">{vi.debtReview.approvedTodayEmpty}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th className="p-2">{vi.debtReview.approvedTodayTime}</th>
              <th className="p-2">{vi.debts.plate}</th>
              <th className="p-2 text-right">{vi.debts.liters}</th>
              <th className="p-2">{vi.debts.customer}</th>
              <th className="p-2">{vi.debtReview.approvedTodayShift}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.visitId} className="border-b">
                <td className="p-2 whitespace-nowrap">
                  {vnTime(row.visitDate).format('HH:mm · DD/MM')}
                </td>
                <td className="p-2 font-mono">{row.plate}</td>
                <td className="p-2 text-right font-mono">{formatLiters(row.liters)}</td>
                <td className="p-2">{row.customerName}</td>
                <td className="p-2 whitespace-nowrap">
                  {row.shiftId === null ? (
                    // The ngày has no ca to point at — the lượt xe is still shown,
                    // rather than dropped, so nothing duyệt'd goes missing here too.
                    <span className="text-muted-foreground">
                      {vi.debtReview.approvedTodayNoShift}
                    </span>
                  ) : (
                    <Link
                      href={`/stations/${row.stationId}/shifts/${row.shiftId}`}
                      className="underline underline-offset-4"
                    >
                      {vnTime(row.visitDate).format('DD/MM')}
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
