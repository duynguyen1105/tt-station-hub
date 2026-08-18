import { TriangleAlert } from 'lucide-react'

import { PriceHistoryDialog } from '@/components/misa-export/price-history-dialog'
import { RetailPriceForm } from '@/components/misa-export/retail-price-form'
import { formatDate, formatVND, vnTime } from '@/lib/format'
import { FuelArea } from '@/lib/generated/prisma/client'
import {
  type BoardCell,
  buildPriceTimeline,
  buildRetailPriceBoard,
} from '@/lib/misa-export/retail-price-board'
import { prisma } from '@/lib/prisma'
import { fuelTypeLabel } from '@/lib/ui/status'
import { vi } from '@/messages/vi'

const AREA_COLUMNS = [FuelArea.FUEL_AREA_1, FuelArea.FUEL_AREA_2] as const

export default async function MisaPricesPage() {
  const prices = await prisma.misaRetailPrice.findMany()

  // effectiveDate is a @db.Date (UTC midnight), so "today" is the Vietnam calendar
  // day read the same way — a price dated today is in force from its first ca.
  const today = new Date(vnTime(new Date()).format('YYYY-MM-DD'))
  const rows = prices.map((price) => ({
    fuelArea: price.fuelArea,
    fuelType: price.fuelType,
    effectiveDate: price.effectiveDate,
    unitPrice: Number(price.unitPrice),
  }))
  const board = buildRetailPriceBoard(rows, today)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <RetailPriceForm prices={rows} />
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left">
            <th className="p-2">{vi.misaSettings.fuel}</th>
            {AREA_COLUMNS.map((area) => (
              <th key={area} className="p-2">
                {vi.fuelArea[area]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {board.map((entry) => (
            <tr key={entry.fuelType} className="border-b">
              <td className="p-2 font-medium">{fuelTypeLabel(entry.fuelType)}</td>
              {/* A nhiên liệu priced the same everywhere gets one cell across both cột
                  vùng — kế toán reads one number because there is only one. */}
              {entry.areaIndependent ? (
                <td className="p-2 align-top" colSpan={AREA_COLUMNS.length}>
                  <PriceHistoryDialog
                    fuelLabel={fuelTypeLabel(entry.fuelType)}
                    areaLabel={vi.misaSettings.bothAreas}
                    areaIndependent
                    rows={buildPriceTimeline(rows, AREA_COLUMNS[0], entry.fuelType, today)}
                  >
                    <PriceCell cell={entry.cells[AREA_COLUMNS[0]]} />
                  </PriceHistoryDialog>
                </td>
              ) : (
                AREA_COLUMNS.map((area) => (
                  <td key={area} className="p-2 align-top">
                    <PriceHistoryDialog
                      fuelLabel={fuelTypeLabel(entry.fuelType)}
                      areaLabel={vi.fuelArea[area]}
                      areaIndependent={false}
                      rows={buildPriceTimeline(rows, area, entry.fuelType, today)}
                    >
                      <PriceCell cell={entry.cells[area]} />
                    </PriceHistoryDialog>
                  </td>
                ))
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PriceCell({ cell }: { cell: BoardCell }) {
  return (
    <span className="block space-y-0.5">
      {cell.current === null ? (
        <span className="text-destructive flex items-center gap-1.5">
          <TriangleAlert className="size-4 shrink-0" />
          {vi.misaSettings.noPrice}
        </span>
      ) : (
        <span className="flex items-baseline gap-2">
          <span className="readout">{formatVND(cell.current.unitPrice)}</span>
          <span className="text-muted-foreground text-xs">
            {formatDate(cell.current.effectiveDate)}
          </span>
        </span>
      )}
      {cell.pending !== null && (
        <span className="text-muted-foreground flex items-baseline gap-2 text-xs">
          <span className="readout">→ {formatVND(cell.pending.unitPrice)}</span>
          <span>{vi.misaSettings.pendingFrom(formatDate(cell.pending.effectiveDate))}</span>
        </span>
      )}
    </span>
  )
}
