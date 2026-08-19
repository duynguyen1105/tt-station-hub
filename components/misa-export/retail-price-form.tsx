'use client'

import { toast } from 'sonner'

import { useState } from 'react'

import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { formatVND } from '@/lib/format'
import type { CatalogueFuel } from '@/lib/fuels/catalogue'
import type { FuelArea } from '@/lib/generated/prisma/client'
import {
  BOARD_AREA_ORDER,
  type BoardPrice,
  buildRetailPriceBoard,
} from '@/lib/misa-export/retail-price-board'
import { vi } from '@/messages/vi'

/** A kỳ is keyed one cell per nhiên liệu per vùng, so cells are addressed by both. */
function cellKey(fuelArea: FuelArea | null, fuelType: string): string {
  return `${fuelArea ?? 'ALL'}:${fuelType}`
}

/**
 * The vùng a nhiên liệu is keyed under, read off its own danh mục row. One priced the
 * same everywhere is asked for once — a single null cell the kỳ then writes into both.
 */
function areasFor(fuel: CatalogueFuel): readonly (FuelArea | null)[] {
  return fuel.areaIndependent ? [null] : BOARD_AREA_ORDER
}

/**
 * Thêm giá as a kỳ điều chỉnh giá: one ngày áp dụng, every nhiên liệu, both vùng in
 * one grid. Each cell shows the price in force on the chosen date, so kế toán can see
 * what a number is changing from; a cell left blank means that fuel did not move and
 * writes nothing. One announcement is one pass through one dialog.
 */
export function RetailPriceForm({
  fuels,
  prices,
}: {
  fuels: CatalogueFuel[]
  prices: BoardPrice[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [effectiveDate, setEffectiveDate] = useState('')
  const [cells, setCells] = useState<Record<string, string>>({})

  // The grid shows what each cell is in force at on the date chosen — the board's own
  // rule, read at that date rather than at today's, so a backdated kỳ shows what was
  // actually being billed then.
  const chosenDate = effectiveDate === '' ? null : new Date(effectiveDate)
  const board = chosenDate === null ? null : buildRetailPriceBoard(fuels, prices, chosenDate)
  const dateHasKy =
    chosenDate !== null &&
    prices.some((price) => price.effectiveDate.getTime() === chosenDate.getTime())

  function reset() {
    setEffectiveDate('')
    setCells({})
  }

  async function submit() {
    if (effectiveDate === '') {
      toast.error(vi.misaSettings.selectDate)
      return
    }
    // Walked over the danh mục the grid was rendered from, so a nhiên liệu kế toán can
    // see and type into is a nhiên liệu that gets submitted. Iterating a list of its own
    // would silently drop whatever the grid showed and that list did not hold.
    const filled = fuels
      .flatMap((fuel) =>
        areasFor(fuel).map((fuelArea) => ({
          fuelArea,
          fuelType: fuel.fuelType,
          entered: (cells[cellKey(fuelArea, fuel.fuelType)] ?? '').trim(),
        }))
      )
      .filter((cell) => cell.entered !== '')
    if (filled.some((cell) => !(Number(cell.entered) > 0))) {
      toast.error(vi.misaSettings.invalidPrice)
      return
    }
    if (filled.length === 0) {
      toast.error(vi.misaSettings.kyEmpty)
      return
    }

    setBusy(true)
    const res = await fetch('/api/settings/misa/prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        effectiveDate,
        cells: filled.map((cell) => ({
          fuelArea: cell.fuelArea,
          fuelType: cell.fuelType,
          unitPrice: Number(cell.entered),
        })),
      }),
    })
    setBusy(false)
    if (res.ok) {
      setOpen(false)
      reset()
      router.refresh()
    } else {
      const body = await res.json().catch(() => null)
      toast.error(body?.error ?? vi.errors.generic)
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">{vi.misaSettings.addPrice}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{vi.misaSettings.kyTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Field>
            <FieldLabel htmlFor="effectiveDate">{vi.misaSettings.effectiveDate}</FieldLabel>
            <Input
              id="effectiveDate"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </Field>

          {dateHasKy && <p className="text-sm">{vi.misaSettings.dateHasKy}</p>}

          {board !== null && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left">
                  <th className="p-2 font-normal">{vi.misaSettings.fuel}</th>
                  {BOARD_AREA_ORDER.map((area) => (
                    <th key={area} className="p-2 font-normal">
                      {vi.fuelArea[area]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {board.map((entry) => (
                  <tr key={entry.fuelType}>
                    <td className="p-2 font-medium">{entry.name}</td>
                    {areasFor(entry).map((area) => {
                      const key = cellKey(area, entry.fuelType)
                      // A null vùng reads the board's vùng 1 cell — both hold the same price.
                      const inForce = entry.cells[area ?? BOARD_AREA_ORDER[0]].current
                      const areaLabel =
                        area === null ? vi.misaSettings.bothAreas : vi.fuelArea[area]
                      return (
                        <td
                          className="space-y-1 p-2"
                          key={key}
                          colSpan={area === null ? BOARD_AREA_ORDER.length : undefined}
                        >
                          <Input
                            type="number"
                            inputMode="numeric"
                            aria-label={`${entry.name} — ${areaLabel}`}
                            value={cells[key] ?? ''}
                            onChange={(e) =>
                              setCells((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                          />
                          <p className="text-muted-foreground text-xs">
                            {inForce === null
                              ? vi.misaSettings.noPrice
                              : `${vi.misaSettings.current}: ${formatVND(inForce.unitPrice)}`}
                          </p>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="text-muted-foreground text-xs">{vi.misaSettings.blankMeansUnchanged}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {vi.common.cancel}
          </Button>
          <Button onClick={submit} loading={busy}>
            {vi.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
