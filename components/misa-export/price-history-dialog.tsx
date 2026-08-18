'use client'

import { History } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { formatDate, formatVND } from '@/lib/format'
import type { TimelineRow } from '@/lib/misa-export/retail-price-board'
import { vi } from '@/messages/vi'

/**
 * A board cell that opens its own Lịch sử: every giá bán lẻ ever recorded for that
 * nhiên liệu in that vùng, newest first, with the one the cell shows marked Hiện
 * hành. Read-only — this is where kế toán explains what a litre cost on the day a
 * ca was exported.
 */
export function PriceHistoryDialog({
  fuelLabel,
  areaLabel,
  rows,
  children,
}: {
  fuelLabel: string
  areaLabel: string
  rows: TimelineRow[]
  children: React.ReactNode
}) {
  const title = vi.misaSettings.historyTitle(fuelLabel, areaLabel)

  return (
    <Dialog>
      <DialogTrigger asChild>
        {/* The whole cell is the trigger; the icon is what tells kế toán so. */}
        <Button
          variant="ghost"
          aria-label={title}
          title={title}
          className="-m-1 h-auto w-full justify-between gap-2 p-1 text-left whitespace-normal"
        >
          {children}
          <History className="text-muted-foreground mt-0.5 shrink-0 self-start" aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-2 text-sm">{vi.misaSettings.noPriceHistory}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="p-2 font-normal">{vi.misaSettings.effectiveDate}</th>
                <th className="p-2 text-right font-normal">{vi.misaSettings.unitPrice}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.effectiveDate.toISOString()} className="border-b last:border-0">
                  <td className="flex items-center gap-2 p-2">
                    {formatDate(row.effectiveDate)}
                    {row.isCurrent && <Badge variant="secondary">{vi.misaSettings.current}</Badge>}
                  </td>
                  <td className="readout p-2 text-right">{formatVND(row.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DialogContent>
    </Dialog>
  )
}
