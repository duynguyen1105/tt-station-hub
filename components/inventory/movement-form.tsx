'use client'

import { toast } from 'sonner'

import { useState } from 'react'

import { useRouter } from 'next/navigation'

import { NoStationFuels } from '@/components/fuels/no-station-fuels'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSaveAction } from '@/hooks/use-save-action'
import { type CatalogueFuel } from '@/lib/fuels/catalogue'
import { vi } from '@/messages/vi'

// Kiểm kê is not offered: tồn thực comes from Đo bồn, and a sổ that disagrees with it is
// brought in line by an Điều chỉnh.
const movementOptions = Object.entries(vi.movementType).filter(
  ([type]) => type !== 'physical_count'
)

/**
 * Nhập, xuất or điều chỉnh one nhiên liệu of the kho by hand.
 *
 * `fuels` is what this trạm sells — its Map nhiên liệu rows, minus what Trường Thịnh
 * stopped selling — so a movement cannot be booked against a nhiên liệu the trạm has no
 * hầm, no trụ and no mã hàng for. Empty, the trạm has declared none, and the form says
 * so instead of opening an ô chọn with nothing in it.
 */
export function MovementForm({
  stationId,
  fuels,
  movement,
}: {
  stationId: string
  fuels: readonly CatalogueFuel[]
  movement?: {
    id: string
    fuelType: string
    movementType: string
    quantity: string
    movementDate: string
    note: string | null
  }
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  // The trạm's first nhiên liệu rather than a khóa written in here: a default the ô chọn
  // does not offer would leave the field blank and submit anyway.
  const [fuelType, setFuelType] = useState(movement?.fuelType ?? fuels[0]?.fuelType ?? '')
  const [movementType, setMovementType] = useState(movement?.movementType ?? 'import')
  const [quantity, setQuantity] = useState(
    movement
      ? movement.movementType === 'sale'
        ? String(Math.abs(Number(movement.quantity)))
        : movement.quantity
      : ''
  )
  const [movementDate, setMovementDate] = useState(movement?.movementDate ?? '')
  const [note, setNote] = useState(movement?.note ?? '')

  async function submit() {
    const magnitude = Number(quantity)
    if (!Number.isFinite(magnitude) || magnitude === 0) {
      toast.error(vi.inventory.invalidQuantity)
      return
    }
    if (!movementDate) {
      toast.error(vi.inventory.missingDate)
      return
    }
    // Quantity is stored signed: sales are negative, imports positive.
    const signed = movementType === 'sale' ? -Math.abs(magnitude) : magnitude

    setBusy(true)
    const res = await fetch(
      movement ? `/api/inventory/movements/${movement.id}` : '/api/inventory/movements',
      {
        method: movement ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(movement ? {} : { stationId }),
          fuelType,
          movementType,
          quantity: signed,
          movementDate,
          note: movement ? note || null : note || undefined,
        }),
      }
    )
    setBusy(false)
    if (res.ok) {
      setOpen(false)
      if (movement) toast.success(vi.inventory.movementSaved)
      router.refresh()
      if (!movement) {
        setQuantity('')
        setNote('')
      }
    } else {
      toast.error(vi.errors.generic)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={movement ? 'ghost' : 'default'}>
          {movement ? vi.common.edit : vi.common.add}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{vi.inventory.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel>{vi.inventory.fuelType}</FieldLabel>
              {fuels.length === 0 && !movement ? (
                <NoStationFuels stationId={stationId} />
              ) : (
                <Select value={fuelType} onValueChange={setFuelType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {movement && !fuels.some((fuel) => fuel.fuelType === movement.fuelType) && (
                      <SelectItem value={movement.fuelType}>{movement.fuelType}</SelectItem>
                    )}
                    {fuels.map((fuel) => (
                      <SelectItem key={fuel.fuelType} value={fuel.fuelType}>
                        {fuel.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field>
              <FieldLabel>{vi.inventory.movementKind}</FieldLabel>
              <Select value={movementType} onValueChange={setMovementType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {movementOptions.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="quantity">{vi.inventory.quantity}</FieldLabel>
            <Input
              id="quantity"
              type="number"
              step="any"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="movementDate">{vi.shifts.date}</FieldLabel>
            <Input
              id="movementDate"
              type="date"
              value={movementDate}
              onChange={(e) => setMovementDate(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="note">{vi.inventory.note}</FieldLabel>
            <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
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

export function ManualMovementDelete({ id }: { id: string }) {
  const { busy, save } = useSaveAction()
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={busy}
      onClick={() => {
        if (window.confirm(vi.inventory.movementConfirmDelete))
          save(`/api/inventory/movements/${id}`, {
            method: 'DELETE',
            success: vi.inventory.movementDeleted,
          })
      }}
    >
      {vi.common.delete}
    </Button>
  )
}
