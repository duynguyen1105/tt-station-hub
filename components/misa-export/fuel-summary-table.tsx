'use client'

import { useFuelTypeLabel } from '@/components/fuels/catalogue-provider'
import { formatLiters } from '@/lib/format'
import type { FuelSummary } from '@/lib/misa-export/build-sales-voucher'
import { cn } from '@/lib/utils'
import { vi } from '@/messages/vi'

/**
 * The per-fuel litres a MISA export is built from — Đo được, Xả gió, Bán nợ and the Bán lẻ
 * left over — for one ca (Xuất MISA) or summed over a khoảng (Xuất MISA theo kỳ).
 */
export function FuelSummaryTable({ summary }: { summary: FuelSummary[] }) {
  const fuelLabel = useFuelTypeLabel()
  return summary.length === 0 ? (
    <p className="text-muted-foreground text-sm">{vi.misaExport.noFuelData}</p>
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left whitespace-nowrap">
            <th className="p-2">{vi.misaExport.fuel}</th>
            <th className="p-2 text-right">{vi.misaExport.metered}</th>
            <th className="p-2 text-right">{vi.misaExport.airPurge}</th>
            <th className="p-2 text-right">{vi.misaExport.credit}</th>
            <th className="p-2 text-right">{vi.misaExport.cash}</th>
          </tr>
        </thead>
        <tbody>
          {summary.map((f) => (
            <tr key={f.fuelType} className="border-b">
              <td className="p-2">{fuelLabel(f.fuelType)}</td>
              <td className="p-2 text-right font-mono whitespace-nowrap">
                {formatLiters(f.meteredLiters)}
              </td>
              {/* A nhiên liệu no trụ purged has nothing to report here, so the
                  cell reads as blank rather than as a 0 somebody keyed in. */}
              <td className="p-2 text-right font-mono whitespace-nowrap">
                {f.airPurgeLiters === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  formatLiters(f.airPurgeLiters)
                )}
              </td>
              <td className="p-2 text-right font-mono whitespace-nowrap">
                {formatLiters(f.creditLiters)}
              </td>
              <td
                className={cn(
                  'p-2 text-right font-mono whitespace-nowrap',
                  f.cashLiters < 0 && 'text-destructive font-medium'
                )}
              >
                {formatLiters(f.cashLiters)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
