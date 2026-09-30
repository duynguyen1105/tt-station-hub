import { StatusBadge } from '@/components/shared/status-badge'
import { formatLiters } from '@/lib/format'
import { fuelTypeLabeller, loadStationFuels } from '@/lib/fuels/load-catalogue'
import { type BaremLookup } from '@/lib/inventory/barem'
import { fetchBaremSheet } from '@/lib/inventory/barem-fetch'
import { baremSheetFor } from '@/lib/inventory/barem-sheets'
import { countableDipWhere } from '@/lib/inventory/dip-review'
import {
  type SaleDispenser,
  type SaleReading,
  computeShiftSales,
} from '@/lib/inventory/shift-sales'
import {
  type BookDay,
  type TankSide,
  bookDayOf,
  fuelStockRows,
  shiftTankRows,
} from '@/lib/inventory/shift-stock'
import { shiftDayWindow } from '@/lib/misa-export/debts-list'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

const num = 'p-2 text-right font-mono whitespace-nowrap'

const refusalLabel: Record<string, string> = {
  'below-minimum': vi.imports.baremOutOfRange,
  'above-maximum': vi.imports.baremOutOfRange,
  'missing-point': vi.imports.baremMissingPoint,
  'unknown-tank': vi.imports.baremUnknownTank,
}

function Liters({ lookup }: { lookup: BaremLookup | null | undefined }) {
  if (!lookup) return <>—</>
  if (!lookup.ok) {
    return (
      <span className="text-muted-foreground font-sans text-xs">{refusalLabel[lookup.reason]}</span>
    )
  }
  return <>{formatLiters(lookup.liters)}</>
}

function SideCells({ side }: { side: TankSide | null }) {
  return (
    <>
      <td className={num}>{side ? side.mm : '—'}</td>
      <td className={num}>
        <Liters lookup={side?.lookup} />
      </td>
    </>
  )
}

/**
 * The Tồn kho block of a ca's phiếu chốt: each hầm before and on the ca's ngày by the
 * Barem, and each nhiên liệu's sổ sách of that ngày against what the hầm hold.
 *
 * Loads its own rows so the page can stream it: the Barem is a live Google-Sheet read
 * (ADR 0005) and should not hold up the trụ table above it.
 */
export async function ShiftStockSection({
  stationId,
  stationCode,
  shiftDate,
  unbookedReadings,
  dispensers,
}: {
  stationId: string
  stationCode: string | undefined
  shiftDate: Date
  /** This ca's readings while it is open — its sales are not in the sổ until chốt. Null once chốt'd. */
  unbookedReadings: SaleReading[] | null
  dispensers: SaleDispenser[]
}) {
  const day = shiftDate.toISOString().slice(0, 10)
  const { start, end } = shiftDayWindow(shiftDate)
  const binding = baremSheetFor(stationCode)
  const dipSelect = { tankCode: true, dipValue: true, fuelType: true } as const
  const [tanks, beforeDips, afterDips, openings, movements, stationFuels, baremRead, fuelLabel] =
    await Promise.all([
      prisma.tank.findMany({
        where: { stationId },
        select: { code: true, fuelType: true, capacityK: true },
      }),
      prisma.tankDipRecord.findMany({
        where: { ...countableDipWhere(stationId), measuredAt: { lt: start } },
        orderBy: { measuredAt: 'desc' },
        distinct: ['tankCode'],
        select: dipSelect,
      }),
      prisma.tankDipRecord.findMany({
        where: { ...countableDipWhere(stationId), measuredAt: { gte: start, lt: end } },
        orderBy: { measuredAt: 'desc' },
        distinct: ['tankCode'],
        select: dipSelect,
      }),
      prisma.inventoryOpeningBalance.findMany({ where: { stationId } }),
      prisma.inventoryMovement.findMany({
        where: { stationId, movementDate: { lte: shiftDate } },
        select: { fuelType: true, movementType: true, quantity: true, movementDate: true },
      }),
      loadStationFuels(stationId),
      binding ? fetchBaremSheet(binding) : null,
      fuelTypeLabeller(),
    ])

  const asDip = (d: (typeof beforeDips)[number]) => ({
    tankCode: d.tankCode,
    dipValue: Number(d.dipValue),
    fuelType: d.fuelType,
  })
  const tankRows = shiftTankRows({
    tanks,
    before: beforeDips.map(asDip),
    after: afterDips.map(asDip),
    barem: baremRead?.ok ? new Map(baremRead.sheet.tanks.map((t) => [t.tankCode, t])) : null,
  })

  const fuels = [
    ...new Set([
      ...stationFuels.map((f) => f.fuelType),
      ...tankRows.flatMap((t) => (t.fuelType ? [t.fuelType] : [])),
    ]),
  ]
  const openingByFuel = new Map(openings.map((o) => [o.fuelType, o]))
  const EPOCH = new Date(0)
  const bookByFuel = new Map<string, BookDay | null>(
    fuels.map((fuel) => {
      const opening = openingByFuel.get(fuel)
      return [
        fuel,
        bookDayOf(
          opening ? Number(opening.openingLiters) : 0,
          opening?.effectiveDate ?? EPOCH,
          movements
            .filter((m) => m.fuelType === fuel)
            .map((m) => ({ ...m, quantity: Number(m.quantity) })),
          day
        ),
      ]
    })
  )
  const provisionalSold = new Map(
    unbookedReadings
      ? computeShiftSales(unbookedReadings, dispensers).sales.map((s) => [s.fuelType, s.liters])
      : []
  )
  const stockRows = fuelStockRows({ fuels, bookByFuel, provisionalSold, tankRows })

  return (
    <div className="grid gap-4 2xl:grid-cols-2 print:grid-cols-2">
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">{vi.shifts.stock.tanksTitle}</h4>
        {baremRead && !baremRead.ok && (
          <p className="text-destructive text-xs">{vi.inventory.baremSheetFailed}</p>
        )}
        {tankRows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{vi.shifts.stock.noTanks}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="p-2">{vi.shifts.stock.tank}</th>
                  <th className="p-2">{vi.shifts.stock.fuel}</th>
                  <th className={num}>{vi.shifts.stock.beforeMm}</th>
                  <th className={num}>{vi.shifts.stock.liters}</th>
                  <th className={num}>{vi.shifts.stock.afterMm}</th>
                  <th className={num}>{vi.shifts.stock.liters}</th>
                </tr>
              </thead>
              <tbody>
                {tankRows.map((row) => (
                  <tr key={row.tankCode} className="border-b">
                    <td className="p-2 font-medium whitespace-nowrap">
                      {row.tankCode.replace('HAM_', 'Hầm ')}
                      {row.capacityK !== null && (
                        <span className="text-muted-foreground font-normal">
                          {' '}
                          · {row.capacityK}K
                        </span>
                      )}
                    </td>
                    <td className="p-2">{row.fuelType ? fuelLabel(row.fuelType) : '—'}</td>
                    <SideCells side={row.before} />
                    <SideCells side={row.after} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold">{vi.shifts.stock.booksTitle}</h4>
          {unbookedReadings && <StatusBadge label={vi.shifts.stock.provisional} tone="warning" />}
        </div>
        {stockRows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{vi.shifts.stock.noFuels}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="p-2">{vi.shifts.stock.fuel}</th>
                  <th className={num}>{vi.shifts.stock.opening}</th>
                  <th className={num}>{vi.shifts.stock.imported}</th>
                  <th className={num}>{vi.shifts.stock.sold}</th>
                  <th className={num}>{vi.shifts.stock.adjusted}</th>
                  <th className={num}>{vi.shifts.stock.closing}</th>
                  <th className={num}>{vi.shifts.stock.barem}</th>
                  <th className={num}>{vi.shifts.stock.variance}</th>
                </tr>
              </thead>
              <tbody>
                {stockRows.map((row) => (
                  <tr key={row.fuelType} className="border-b">
                    <td className="p-2 font-medium">{fuelLabel(row.fuelType)}</td>
                    {row.book ? (
                      <>
                        <td className={num}>{formatLiters(row.book.opening)}</td>
                        <td className={num}>{formatLiters(row.book.imported)}</td>
                        <td className={num}>{formatLiters(row.book.sold)}</td>
                        <td className={num}>{formatLiters(row.book.adjusted)}</td>
                        <td className={`${num} font-semibold`}>{formatLiters(row.book.closing)}</td>
                      </>
                    ) : (
                      <td className="text-muted-foreground p-2 text-xs" colSpan={5}>
                        {vi.shifts.stock.beforeOpening}
                      </td>
                    )}
                    <td className={num}>{row.barem === null ? '—' : formatLiters(row.barem)}</td>
                    <td className={num}>
                      {row.variance === null ? (
                        row.book && (
                          <span className="text-muted-foreground font-sans text-xs">
                            {vi.inventory.diffIncomplete}
                          </span>
                        )
                      ) : (
                        <span
                          className={row.variance !== 0 ? 'font-semibold' : 'text-muted-foreground'}
                        >
                          {formatLiters(row.variance)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
