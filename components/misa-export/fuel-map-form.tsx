'use client'

import { toast } from 'sonner'

import { useState } from 'react'

import { useRouter } from 'next/navigation'

import { useFuelTypeLabel } from '@/components/fuels/catalogue-provider'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { type CatalogueFuel } from '@/lib/fuels/catalogue'
import { vi } from '@/messages/vi'

export type MisaFuelMapEntry = {
  fuelType: string
  productCode: string
  productName: string | null
  warehouseCode: string
  unit: string | null
}

/**
 * One row of Map nhiên liệu, written or rewritten. With an `entry` it edits that row
 * and the nhiên liệu is fixed; without one it is Thêm nhiên liệu and the trạm picks a
 * nhiên liệu out of `addable` first — which is the danh mục minus what it already has,
 * so the row it writes can only ever be a new one.
 */
export function MisaFuelMapForm({
  stationId,
  entry,
  addable,
}: { stationId: string } & (
  | { entry: MisaFuelMapEntry; addable?: never }
  | { entry?: never; addable: readonly CatalogueFuel[] }
)) {
  const router = useRouter()
  const fuelLabel = useFuelTypeLabel()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fuelType, setFuelType] = useState(entry?.fuelType ?? '')
  const [productCode, setProductCode] = useState(entry?.productCode ?? '')
  const [productName, setProductName] = useState(entry?.productName ?? '')
  const [warehouseCode, setWarehouseCode] = useState(entry?.warehouseCode ?? '')
  const [unit, setUnit] = useState(entry?.unit ?? '')

  function reset() {
    setFuelType(entry?.fuelType ?? '')
    setProductCode(entry?.productCode ?? '')
    setProductName(entry?.productName ?? '')
    setWarehouseCode(entry?.warehouseCode ?? '')
    setUnit(entry?.unit ?? '')
  }

  async function submit() {
    if (!fuelType || !productCode.trim() || !warehouseCode.trim()) {
      toast.error(vi.errors.generic)
      return
    }
    setBusy(true)
    const res = await fetch('/api/settings/misa/fuel-map', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stationId,
        fuelType,
        productCode: productCode.trim(),
        productName: productName.trim() || null,
        warehouseCode: warehouseCode.trim(),
        unit: unit.trim() || null,
      }),
    })
    setBusy(false)
    if (res.ok) {
      setOpen(false)
      router.refresh()
    } else {
      const body = await res.json().catch(() => null)
      toast.error(body?.error ?? vi.errors.generic)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reset()
        setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        {entry ? (
          <Button size="sm" variant="ghost">
            {vi.misaSettings.edit}
          </Button>
        ) : (
          // Nothing left to take on: every nhiên liệu Trường Thịnh sells is already
          // declared, so the button stays rather than opening an empty ô chọn.
          <Button size="sm" disabled={addable?.length === 0}>
            {vi.misaSettings.addFuelMap}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {entry
              ? `${vi.misaSettings.editFuelMap} — ${fuelLabel(entry.fuelType)}`
              : vi.misaSettings.addFuelMap}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {!entry && (
            <Field>
              <FieldLabel>{vi.misaSettings.fuel}</FieldLabel>
              <Select value={fuelType} onValueChange={setFuelType}>
                <SelectTrigger>
                  <SelectValue placeholder={vi.misaSettings.selectFuel} />
                </SelectTrigger>
                <SelectContent>
                  {addable?.map((fuel) => (
                    <SelectItem key={fuel.fuelType} value={fuel.fuelType}>
                      {fuel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="productCode">{vi.misaSettings.productCode}</FieldLabel>
            <Input
              id="productCode"
              value={productCode}
              onChange={(e) => setProductCode(e.target.value)}
            />
            <FieldDescription>{vi.misaSettings.productCodeNote}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="productName">{vi.misaSettings.productName}</FieldLabel>
            <Input
              id="productName"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="warehouseCode">{vi.misaSettings.warehouseCode}</FieldLabel>
            <Input
              id="warehouseCode"
              value={warehouseCode}
              onChange={(e) => setWarehouseCode(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="unit">{vi.misaSettings.unit}</FieldLabel>
            <Input id="unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
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
