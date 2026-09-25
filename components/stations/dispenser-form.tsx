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
  /** Hầm the trụ draws from; empty means no hầm. */
  tankIds: string[]
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
 * Lắp một trụ, sửa một trụ, or retire one. Thêm trụ from a hầm's menu pre-ticks
 * that hầm. A trụ pumps the shared nhiên liệu of its chosen hầm, or selects its
 * own when it has none. Changing nhiên liệu still requires confirmation.
 */
export function DispenserForm({
  stationId,
  dispenser,
  fuels,
  tanks,
  initialTankId,
  open: controlledOpen,
  onOpenChange,
}: {
  stationId: string
  dispenser?: DispenserRow
  fuels: readonly DispenserFuelOption[]
  tanks: readonly DispenserTankOption[]
  initialTankId?: string
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
  const [tankIds, setTankIds] = useState(
    () => dispenser?.tankIds ?? (initialTankId ? [initialTankId] : [])
  )
  const [fuelType, setFuelType] = useState(dispenser?.fuel.fuelType ?? '')
  // Both đồng hồ ticked is what every trụ at Trường Thịnh has today; a trụ without one
  // is the exception the kế toán unticks.
  const [electronic, setElectronic] = useState(dispenser?.hasElectronicMeter ?? true)
  const [mechanical, setMechanical] = useState(dispenser?.hasMechanicalMeter ?? true)

  // What the ô chọn offers: the trạm's Map nhiên liệu rows, plus whatever this trụ
  // already pumps — a trụ đã ngừng may hold one the trạm has since stopped selling, and
  // it has to read back as what it pumps rather than as an empty box.
  const options = dispenserFuelOptions(fuels, dispenser?.fuel)
  const chosenTank = tanks.find((tank) => tank.id === tankIds[0])
  // What the trụ will pump once saved: the hầm's nhiên liệu, or its own with no hầm.
  const resultingFuel = chosenTank
    ? chosenTank.fuel
    : options.find((fuel) => fuel.fuelType === fuelType)

  function reset() {
    setPumpNumber('')
    setTankIds(dispenser?.tankIds ?? (initialTankId ? [initialTankId] : []))
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
      tankIds,
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
            {/* Not a <Field>: Field dims every control inside once one is disabled, and the
                hầm of another nhiên liệu are disabled while the chosen ones stay live. */}
            <div className="flex flex-col gap-2">
              <FieldLabel>{vi.dispensers.tank}</FieldLabel>
              <div className="space-y-2">
                {tanks.map((tank) => (
                  <label key={tank.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={tankIds.includes(tank.id)}
                      disabled={!!chosenTank && chosenTank.fuel.fuelType !== tank.fuel.fuelType}
                      onCheckedChange={(checked) =>
                        setTankIds((current) =>
                          checked === true
                            ? [...current, tank.id]
                            : current.filter((id) => id !== tank.id)
                        )
                      }
                    />
                    <span>
                      {tank.name} — {tank.fuel.name}
                      {tank.capacityK !== null && ` (${tank.capacityK}K)`}
                    </span>
                  </label>
                ))}
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={tankIds.length === 0} onCheckedChange={() => setTankIds([])} />
                  <span>{vi.dispensers.noTank}</span>
                </label>
              </div>
              <FieldDescription>
                {chosenTank ? vi.dispensers.tankFuel(chosenTank.fuel.name) : vi.dispensers.tankNote}
                {chosenTank && ` ${vi.dispensers.sameFuelHint}`}
              </FieldDescription>
            </div>
            {tankIds.length === 0 && (
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
