'use client'

import { MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'

import { useState } from 'react'

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
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  type DispenserFuelOption,
  dispenserFuelOptions,
  refuseDispenserShape,
} from '@/lib/dispensers/rules'
import { vi } from '@/messages/vi'

/** One trụ as its row hands it to the form: the tên it is known by, and what it holds. */
export type DispenserRow = {
  id: string
  displayName: string
  /**
   * What it pumps today, named as the danh mục names it — read unfiltered, so a nhiên
   * liệu đã ngừng still reads its tên rather than its khóa.
   */
  fuel: DispenserFuelOption
  tankNumber: number | null
  tankCapacityK: number | null
  hasElectronicMeter: boolean
  hasMechanicalMeter: boolean
  isActive: boolean
}

/** What a nullable số looks like in its box: nothing at all, or its digits. */
function toInputValue(value: number | null): string {
  return value === null ? '' : String(value)
}

/**
 * What a box reads back as. A blank box means "không khai", not zero — the column is
 * nullable for exactly that — and so does anything that is not a number, rather than
 * the NaN that would reach the route as a null it never typed.
 */
function numberOrNull(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Lắp một trụ, sửa một trụ, or retire one. With a `dispenser` it is that row's menu —
 * Chỉnh sửa and Ngừng sử dụng / Dùng lại; without one it is Thêm trụ and the trạm gives
 * a số trụ and a nhiên liệu first.
 *
 * `fuels` is what the trạm declared it sells, so the two can never disagree about the
 * nhiên liệu a trụ pumps. Changing it on an edit is a hoán cải — the trụ pumps the new
 * nhiên liệu from here on, while every chỉ số it has already written keeps the one
 * stamped on it — so it is confirmed rather than saved with the rest.
 */
export function DispenserForm({
  stationId,
  dispenser,
  fuels,
}: {
  stationId: string
  dispenser?: DispenserRow
  fuels: readonly DispenserFuelOption[]
}) {
  const { busy, save } = useSaveAction()
  const [open, setOpen] = useState(false)
  const [standing, setStanding] = useState(false)
  const [converting, setConverting] = useState(false)
  const [pumpNumber, setPumpNumber] = useState('')
  const [fuelType, setFuelType] = useState(dispenser?.fuel.fuelType ?? '')
  const [tankNumber, setTankNumber] = useState(toInputValue(dispenser?.tankNumber ?? null))
  const [tankCapacityK, setTankCapacityK] = useState(toInputValue(dispenser?.tankCapacityK ?? null))
  // Both đồng hồ ticked is what every trụ at Trường Thịnh has today; a trụ without one
  // is the exception the kế toán unticks.
  const [electronic, setElectronic] = useState(dispenser?.hasElectronicMeter ?? true)
  const [mechanical, setMechanical] = useState(dispenser?.hasMechanicalMeter ?? true)

  // What the ô chọn offers: the trạm's Map nhiên liệu rows, plus whatever this trụ
  // already pumps — a trụ đã ngừng may hold one the trạm has since stopped selling, and
  // it has to read back as what it pumps rather than as an empty box.
  const options = dispenserFuelOptions(fuels, dispenser?.fuel)

  function reset() {
    setPumpNumber('')
    setFuelType(dispenser?.fuel.fuelType ?? '')
    setTankNumber(toInputValue(dispenser?.tankNumber ?? null))
    setTankCapacityK(toInputValue(dispenser?.tankCapacityK ?? null))
    setElectronic(dispenser?.hasElectronicMeter ?? true)
    setMechanical(dispenser?.hasMechanicalMeter ?? true)
  }

  function openChange(next: boolean) {
    if (next) reset()
    setOpen(next)
  }

  function editBody() {
    return {
      fuelType,
      tankNumber: numberOrNull(tankNumber),
      tankCapacityK: numberOrNull(tankCapacityK),
      hasElectronicMeter: electronic,
      hasMechanicalMeter: mechanical,
    }
  }

  function saveEdit(row: DispenserRow) {
    save(
      `/api/stations/${stationId}/dispensers/${row.id}`,
      { method: 'PATCH', body: editBody(), success: vi.dispensers.saved },
      {
        onSuccess: () => {
          setConverting(false)
          setOpen(false)
        },
      }
    )
  }

  function submit() {
    // The same rules the route keeps, asked here first so a dung tích that would be
    // dropped is said out loud rather than vanishing behind a success toast.
    const refusal = refuseDispenserShape(editBody())
    if (refusal) {
      toast.error(refusal)
      return
    }
    if (!fuelType) {
      toast.error(vi.dispensers.fuelRequired)
      return
    }
    if (dispenser) {
      // A hoán cải is a physical event with a tồn kho it does not move, so it is asked
      // about before it is written rather than saved alongside a hầm number.
      if (fuelType !== dispenser.fuel.fuelType) {
        setConverting(true)
        return
      }
      saveEdit(dispenser)
      return
    }

    const number = numberOrNull(pumpNumber)
    if (number === null || !Number.isInteger(number) || number < 1) {
      toast.error(vi.dispensers.numberRequired)
      return
    }
    save(
      `/api/stations/${stationId}/dispensers`,
      { body: { pumpNumber: number, ...editBody() }, success: vi.dispensers.saved },
      { onSuccess: () => setOpen(false) }
    )
  }

  function setActive(row: DispenserRow, isActive: boolean) {
    save(
      `/api/stations/${stationId}/dispensers/${row.id}`,
      {
        method: 'PATCH',
        body: { isActive },
        success: isActive ? vi.dispensers.reactivated : vi.dispensers.deactivated,
      },
      { onSuccess: () => setStanding(false) }
    )
  }

  return (
    <>
      {dispenser ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={vi.dispensers.actions(dispenser.displayName)}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => openChange(true)}>
              {vi.misaSettings.edit}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant={dispenser.isActive ? 'destructive' : 'default'}
              onSelect={() => setStanding(true)}
            >
              {dispenser.isActive ? vi.dispensers.deactivate : vi.dispensers.reactivate}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        // Nothing to pump: a trạm declares its nhiên liệu before it lắp a trụ, so the
        // button waits rather than opening an ô chọn with nothing in it.
        <Button size="sm" disabled={fuels.length === 0} onClick={() => openChange(true)}>
          {vi.dispensers.add}
        </Button>
      )}

      {dispenser && (
        // Outside the DropdownMenu on purpose: the menu's content unmounts when it
        // closes, and a dialog opened from inside it would close with the menu.
        <AlertDialog open={standing} onOpenChange={setStanding}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {dispenser.isActive
                  ? vi.dispensers.deactivateTitle(dispenser.displayName)
                  : vi.dispensers.reactivateTitle(dispenser.displayName)}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {dispenser.isActive ? vi.dispensers.deactivateBody : vi.dispensers.reactivateBody}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{vi.common.cancel}</AlertDialogCancel>
              <AlertDialogAction
                loading={busy}
                onClick={(e) => {
                  // The default Action closes on click, which would unmount the
                  // spinner before the refresh lands.
                  e.preventDefault()
                  setActive(dispenser, !dispenser.isActive)
                }}
              >
                {dispenser.isActive ? vi.dispensers.deactivate : vi.dispensers.reactivate}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {dispenser && (
        // Over the open Chỉnh sửa dialog, not instead of it: cancelling here goes back
        // to the form with everything typed still in it.
        <AlertDialog open={converting} onOpenChange={setConverting}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {vi.dispensers.convertTitle(dispenser.displayName)}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {vi.dispensers.convertBody(
                  dispenser.fuel.name,
                  options.find((fuel) => fuel.fuelType === fuelType)?.name ?? fuelType
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{vi.common.cancel}</AlertDialogCancel>
              <AlertDialogAction
                loading={busy}
                onClick={(e) => {
                  e.preventDefault()
                  saveEdit(dispenser)
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
            <DialogTitle>
              {dispenser ? `${vi.dispensers.edit} — ${dispenser.displayName}` : vi.dispensers.add}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!dispenser && (
              <Field>
                <FieldLabel htmlFor="pumpNumber">{vi.dispensers.pumpNumber}</FieldLabel>
                <Input
                  id="pumpNumber"
                  type="number"
                  min={1}
                  value={pumpNumber}
                  onChange={(e) => setPumpNumber(e.target.value)}
                />
                <FieldDescription>{vi.dispensers.pumpNumberNote}</FieldDescription>
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
              {dispenser && <FieldDescription>{vi.dispensers.fuelEditNote}</FieldDescription>}
            </Field>
            <Field>
              <FieldLabel htmlFor="tankNumber">{vi.dispensers.tankNumber}</FieldLabel>
              <Input
                id="tankNumber"
                type="number"
                min={1}
                value={tankNumber}
                onChange={(e) => setTankNumber(e.target.value)}
              />
              <FieldDescription>{vi.dispensers.tankNote}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="tankCapacityK">{vi.dispensers.tankCapacityK}</FieldLabel>
              <Input
                id="tankCapacityK"
                type="number"
                min={1}
                value={tankCapacityK}
                onChange={(e) => setTankCapacityK(e.target.value)}
              />
              <FieldDescription>{vi.dispensers.tankCapacityNote}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>{vi.dispensers.meters}</FieldLabel>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={electronic}
                  onCheckedChange={(state) => setElectronic(state === true)}
                />
                <span>{vi.dispensers.electronicMeter}</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={mechanical}
                  onCheckedChange={(state) => setMechanical(state === true)}
                />
                <span>{vi.dispensers.mechanicalMeter}</span>
              </label>
              <FieldDescription>{vi.dispensers.metersNote}</FieldDescription>
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
