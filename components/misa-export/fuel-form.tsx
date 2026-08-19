'use client'

import { MoreHorizontal } from 'lucide-react'

import { useId, useState } from 'react'

import { FuelRemoveDialog } from '@/components/misa-export/fuel-remove-dialog'
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
import { useSaveAction } from '@/hooks/use-save-action'
import type { CatalogueFuel } from '@/lib/fuels/catalogue'
import { vi } from '@/messages/vi'

/**
 * Thêm nhiên liệu, and the menu on a giá bán lẻ row — Sửa, Xoá and, on a nhiên liệu
 * đã ngừng, Dùng lại. Thêm and Sửa are one component because they ask the same two
 * questions — the tên, and whether the nhiên liệu is một giá toàn quốc — and differ
 * only in where they are opened from and what they POST to.
 *
 * The khóa is nowhere on screen: it is generated from the tên when the nhiên liệu is
 * created and frozen from then on, so kế toán never type one, and Sửa cannot move one.
 * That is what lets a corrected tên keep every giá, tồn kho and past ca the nhiên liệu
 * already has.
 *
 * The checkbox carries no guard. Whether a product is regulated per vùng is a property
 * of the product, not a state it passes through.
 *
 * A nhiên liệu đã ngừng offers only Dùng lại: it is off every ô chọn until it comes
 * back, and comes back with its lịch sử giá exactly as it left.
 */
export function FuelForm({ fuel }: { fuel?: CatalogueFuel }) {
  const editing = fuel !== undefined
  const { busy, save } = useSaveAction()
  const nameId = useId()
  const [open, setOpen] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [name, setName] = useState(fuel?.name ?? '')
  const [areaIndependent, setAreaIndependent] = useState(fuel?.areaIndependent ?? false)

  // Reset on the way in rather than out: the dialog stays mounted while it fades, so
  // clearing on close would blank the fields in front of whoever just cancelled.
  function openChange(next: boolean) {
    if (next) {
      setName(fuel?.name ?? '')
      setAreaIndependent(fuel?.areaIndependent ?? false)
    }
    setOpen(next)
  }

  function submit() {
    save(
      editing ? `/api/settings/misa/fuels/${fuel.fuelType}` : '/api/settings/misa/fuels',
      {
        method: editing ? 'PATCH' : 'POST',
        body: { name: name.trim(), areaIndependent },
        success: vi.misaSettings.saved,
      },
      { onSuccess: () => openChange(false) }
    )
  }

  return (
    <>
      {editing ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={vi.misaSettings.fuelActions(fuel.name)}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {fuel.isActive ? (
              <>
                <DropdownMenuItem onSelect={() => openChange(true)}>
                  {vi.common.edit}
                </DropdownMenuItem>
                {/* Xoá asks what is using the nhiên liệu before it does anything, and
                    becomes Ngừng sử dụng when the answer is "something". */}
                <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(true)}>
                  {vi.common.delete}
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem
                onSelect={() =>
                  save(`/api/settings/misa/fuels/${fuel.fuelType}/active`, {
                    method: 'PATCH',
                    body: { isActive: true },
                    success: vi.misaSettings.fuelReactivated,
                  })
                }
              >
                {vi.misaSettings.reactivateFuel}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button size="sm" onClick={() => openChange(true)}>
          {vi.misaSettings.addFuel}
        </Button>
      )}

      {editing && removing && (
        // Outside the DropdownMenu on purpose: the menu's content unmounts when it
        // closes, and a dialog opened from inside it would close with the menu.
        <FuelRemoveDialog fuel={fuel} onClose={() => setRemoving(false)} />
      )}

      <Dialog open={open} onOpenChange={openChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? vi.misaSettings.editFuel : vi.misaSettings.addFuel}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field>
              <FieldLabel htmlFor={nameId}>{vi.misaSettings.fuelName}</FieldLabel>
              <Input
                id={nameId}
                value={name}
                placeholder="Xăng RON 98"
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field>
              <label className="flex items-start gap-2 text-sm leading-tight">
                <Checkbox
                  className="mt-0.5"
                  checked={areaIndependent}
                  onCheckedChange={(state) => setAreaIndependent(state === true)}
                />
                <span>{vi.misaSettings.areaIndependent}</span>
              </label>
              <FieldDescription>{vi.misaSettings.areaIndependentHint}</FieldDescription>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => openChange(false)}>
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
