'use client'

import { MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'

import { useState } from 'react'

import {
  DispenserForm,
  type DispenserTankOption,
  numberOrNull,
  toInputValue,
} from '@/components/stations/dispenser-form'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSaveAction } from '@/hooks/use-save-action'
import { type DispenserFuelOption, dispenserFuelOptions } from '@/lib/dispensers/rules'
import { vi } from '@/messages/vi'

/** One hầm as its row hands it to the form. */
export type TankRow = {
  id: string
  name: string
  fuel: DispenserFuelOption
  capacityK: number | null
  /** The trụ drawing from it, retired ones included, by tên. */
  dispenserNames: string[]
}

/**
 * Tạo một hầm, sửa một hầm, or xóa one. With a `tank` it is that row's menu — Thêm trụ
 * into it, Chỉnh sửa and Xóa hầm; without one it is Thêm hầm, and the trạm gives a số
 * hầm first. `tanks` is what the Thêm trụ form offers should the trụ belong elsewhere.
 *
 * Changing the nhiên liệu on an edit converts every trụ drawing from the hầm, so it is
 * confirmed — naming those trụ — rather than saved with the dung tích.
 */
export function TankForm({
  stationId,
  tank,
  fuels,
  tanks,
}: {
  stationId: string
  tank?: TankRow
  fuels: readonly DispenserFuelOption[]
  tanks: readonly DispenserTankOption[]
}) {
  const { busy, save } = useSaveAction()
  const [open, setOpen] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [converting, setConverting] = useState(false)
  const [adding, setAdding] = useState(false)
  const [tankNumber, setTankNumber] = useState('')
  const [fuelType, setFuelType] = useState(tank?.fuel.fuelType ?? '')
  const [capacityK, setCapacityK] = useState(toInputValue(tank?.capacityK ?? null))

  const options = dispenserFuelOptions(fuels, tank?.fuel)

  function openChange(next: boolean) {
    if (next) {
      setTankNumber('')
      setFuelType(tank?.fuel.fuelType ?? '')
      setCapacityK(toInputValue(tank?.capacityK ?? null))
    }
    setOpen(next)
  }

  function saveEdit(row: TankRow) {
    save(
      `/api/stations/${stationId}/tanks/${row.id}`,
      {
        method: 'PATCH',
        body: { fuelType, capacityK: numberOrNull(capacityK) },
        success: vi.tanks.saved,
      },
      {
        onSuccess: () => {
          setConverting(false)
          setOpen(false)
        },
      }
    )
  }

  function submit() {
    if (!fuelType) {
      toast.error(vi.dispensers.fuelRequired)
      return
    }
    if (tank) {
      if (fuelType !== tank.fuel.fuelType) {
        setConverting(true)
        return
      }
      saveEdit(tank)
      return
    }

    const number = numberOrNull(tankNumber)
    if (number === null || !Number.isInteger(number) || number < 1) {
      toast.error(vi.tanks.numberRequired)
      return
    }
    save(
      `/api/stations/${stationId}/tanks`,
      {
        body: { tankNumber: number, fuelType, capacityK: numberOrNull(capacityK) },
        success: vi.tanks.saved,
      },
      { onSuccess: () => setOpen(false) }
    )
  }

  return (
    <>
      {tank ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={vi.tanks.actions(tank.name)}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setAdding(true)}>
              {vi.dispensers.add}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openChange(true)}>
              {vi.misaSettings.edit}
            </DropdownMenuItem>
            {/* Only an empty hầm offers Xóa: the route refuses one with trụ, and a
                button that can only fail is worse than none. */}
            {tank.dispenserNames.length === 0 && (
              <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(true)}>
                {vi.tanks.remove}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        // A hầm holds a nhiên liệu the trạm sells, so the button waits for Map nhiên liệu.
        <Button size="sm" disabled={fuels.length === 0} onClick={() => openChange(true)}>
          {vi.tanks.add}
        </Button>
      )}

      {tank && adding && (
        // Mounted only while open, so every Thêm trụ starts from a blank form on this hầm.
        <DispenserForm
          stationId={stationId}
          fuels={fuels}
          tanks={tanks}
          tankId={tank.id}
          open
          onOpenChange={setAdding}
        />
      )}

      {tank && (
        // Outside the DropdownMenu on purpose: the menu's content unmounts when it
        // closes, and a dialog opened from inside it would close with the menu.
        <AlertDialog open={removing} onOpenChange={setRemoving}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{vi.tanks.removeTitle(tank.name)}</AlertDialogTitle>
              <AlertDialogDescription>{vi.tanks.removeBody}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{vi.common.cancel}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                loading={busy}
                onClick={(e) => {
                  // The default Action closes on click, which would unmount the
                  // spinner before the refresh lands.
                  e.preventDefault()
                  save(
                    `/api/stations/${stationId}/tanks/${tank.id}`,
                    { method: 'DELETE', success: vi.tanks.removed },
                    { onSuccess: () => setRemoving(false) }
                  )
                }}
              >
                {vi.tanks.remove}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {tank && (
        // Over the open Chỉnh sửa dialog, not instead of it: cancelling here goes back
        // to the form with everything typed still in it.
        <AlertDialog open={converting} onOpenChange={setConverting}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{vi.tanks.convertTitle(tank.name)}</AlertDialogTitle>
              <AlertDialogDescription>
                {vi.tanks.convertBody(
                  tank.fuel.name,
                  options.find((fuel) => fuel.fuelType === fuelType)?.name ?? fuelType,
                  tank.dispenserNames.join(', ')
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{vi.common.cancel}</AlertDialogCancel>
              <AlertDialogAction
                loading={busy}
                onClick={(e) => {
                  e.preventDefault()
                  saveEdit(tank)
                }}
              >
                {vi.dispensers.convert}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <Dialog open={open} onOpenChange={openChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tank ? `${vi.tanks.edit} — ${tank.name}` : vi.tanks.add}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!tank && (
              <Field>
                <FieldLabel htmlFor="tankNumber">{vi.tanks.tankNumber}</FieldLabel>
                <Input
                  id="tankNumber"
                  type="number"
                  min={1}
                  value={tankNumber}
                  onChange={(e) => setTankNumber(e.target.value)}
                />
                <FieldDescription>{vi.tanks.tankNumberNote}</FieldDescription>
              </Field>
            )}
            <Field>
              <FieldLabel>{vi.misaSettings.fuel}</FieldLabel>
              <Select value={fuelType} onValueChange={setFuelType}>
                <SelectTrigger>
                  <SelectValue placeholder={vi.misaSettings.selectFuel} />
                </SelectTrigger>
                <SelectContent>
                  {options.map((fuel) => (
                    <SelectItem key={fuel.fuelType} value={fuel.fuelType}>
                      {fuel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                {tank ? vi.tanks.fuelEditNote : vi.tanks.fuelNote}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="capacityK">{vi.tanks.capacityK}</FieldLabel>
              <Input
                id="capacityK"
                type="number"
                min={1}
                value={capacityK}
                onChange={(e) => setCapacityK(e.target.value)}
              />
              <FieldDescription>{vi.tanks.capacityNote}</FieldDescription>
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
    </>
  )
}
