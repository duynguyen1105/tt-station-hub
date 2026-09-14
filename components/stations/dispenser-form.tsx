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
  /** The hầm it draws from, or null for a trụ with none. */
  tankId: string | null
  hasElectronicMeter: boolean
  hasMechanicalMeter: boolean
  isActive: boolean
}

/** A hầm as the ô chọn offers it: the tên it reads as, and what it holds. */
export type DispenserTankOption = {
  id: string
  name: string
  fuel: DispenserFuelOption
  capacityK: number | null
}

/** What a nullable số looks like in its box: nothing at all, or its digits. */
export function toInputValue(value: number | null): string {
  return value === null ? '' : String(value)
}

// Radix Select refuses an empty-string item value, so a trụ drawing from no hầm travels
// under a sentinel; '' stays the "not yet chosen" of Thêm trụ.
const NO_TANK = 'none'

/**
 * What a box reads back as. A blank box means "không khai", not zero — the column is
 * nullable for exactly that — and so does anything that is not a number, rather than
 * the NaN that would reach the route as a null it never typed.
 */
export function numberOrNull(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Lắp một trụ, sửa một trụ, or retire one. With a `dispenser` it is that row's menu —
 * Chỉnh sửa and Ngừng sử dụng / Dùng lại; without one it is Thêm trụ and the trạm gives
 * a số trụ and the hầm it draws from.
 *
 * Thêm trụ is opened from a hầm's menu, which holds `open` and hands over its `tankId`
 * as the hầm already chosen; the form has no button of its own for it.
 *
 * The hầm is the root: a trụ drawing from one pumps what the hầm holds, and only a trụ
 * with no hầm picks a nhiên liệu of its own — from `fuels`, what the trạm declared it
 * sells. Whichever way the nhiên liệu changes on an edit it is a hoán cải — the trụ
 * pumps the new nhiên liệu from here on, while every chỉ số it has already written keeps
 * the one stamped on it — so it is confirmed rather than saved with the rest.
 */
export function DispenserForm({
  stationId,
  dispenser,
  fuels,
  tanks,
  tankId,
  open: controlledOpen,
  onOpenChange,
}: {
  stationId: string
  dispenser?: DispenserRow
  fuels: readonly DispenserFuelOption[]
  tanks: readonly DispenserTankOption[]
  tankId?: string | null
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const { busy, save } = useSaveAction()
  const [ownOpen, setOwnOpen] = useState(false)
  const open = controlledOpen ?? ownOpen
  const setOpen = onOpenChange ?? setOwnOpen
  const [standing, setStanding] = useState(false)
  const [converting, setConverting] = useState(false)
  const [pumpNumber, setPumpNumber] = useState('')
  const [tankChoice, setTankChoice] = useState(initialTankChoice())
  const [fuelType, setFuelType] = useState(dispenser?.fuel.fuelType ?? '')
  // Both đồng hồ ticked is what every trụ at Trường Thịnh has today; a trụ without one
  // is the exception the kế toán unticks.
  const [electronic, setElectronic] = useState(dispenser?.hasElectronicMeter ?? true)
  const [mechanical, setMechanical] = useState(dispenser?.hasMechanicalMeter ?? true)

  // What the ô chọn offers: the trạm's Map nhiên liệu rows, plus whatever this trụ
  // already pumps — a trụ đã ngừng may hold one the trạm has since stopped selling, and
  // it has to read back as what it pumps rather than as an empty box.
  const options = dispenserFuelOptions(fuels, dispenser?.fuel)
  const chosenTank = tanks.find((tank) => tank.id === tankChoice)
  // What the trụ will pump once saved: the hầm's nhiên liệu, or its own with no hầm.
  const resultingFuel = chosenTank
    ? chosenTank.fuel
    : options.find((fuel) => fuel.fuelType === fuelType)

  function initialTankChoice() {
    if (dispenser) return dispenser.tankId ?? NO_TANK
    if (tankId === undefined) return ''
    return tankId ?? NO_TANK
  }

  function reset() {
    setPumpNumber('')
    setTankChoice(initialTankChoice())
    setFuelType(dispenser?.fuel.fuelType ?? '')
    setElectronic(dispenser?.hasElectronicMeter ?? true)
    setMechanical(dispenser?.hasMechanicalMeter ?? true)
  }

  function openChange(next: boolean) {
    if (next) reset()
    setOpen(next)
  }

  function editBody() {
    return {
      tankId: chosenTank?.id ?? null,
      fuelType: chosenTank || !fuelType ? null : fuelType,
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
    // The same rules the route keeps, asked here first so the refusal lands on the form
    // rather than after a round-trip.
    const refusal = refuseDispenserShape(editBody())
    if (refusal) {
      toast.error(refusal)
      return
    }
    if (tankChoice === '') {
      toast.error(vi.dispensers.tankRequired)
      return
    }
    if (!resultingFuel) {
      toast.error(vi.dispensers.fuelRequired)
      return
    }
    if (dispenser) {
      // A hoán cải is a physical event with a tồn kho it does not move, so it is asked
      // about before it is written rather than saved alongside a change of hầm.
      if (resultingFuel.fuelType !== dispenser.fuel.fuelType) {
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
      {dispenser && (
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
                {vi.dispensers.convertBody(dispenser.fuel.name, resultingFuel?.name ?? '')}
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
              <FieldLabel>{vi.dispensers.tank}</FieldLabel>
              <Select value={tankChoice} onValueChange={setTankChoice}>
                <SelectTrigger>
                  <SelectValue placeholder={vi.dispensers.selectTank} />
                </SelectTrigger>
                <SelectContent>
                  {tanks.map((tank) => (
                    <SelectItem key={tank.id} value={tank.id}>
                      {tank.name} — {tank.fuel.name}
                      {tank.capacityK !== null && ` (${tank.capacityK}K)`}
                    </SelectItem>
                  ))}
                  <SelectItem value={NO_TANK}>{vi.dispensers.noTank}</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>
                {chosenTank ? vi.dispensers.tankFuel(chosenTank.fuel.name) : vi.dispensers.tankNote}
              </FieldDescription>
            </Field>
            {tankChoice === NO_TANK && (
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
            )}
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
