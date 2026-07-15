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
import { fuelTypeLabel } from '@/lib/ui/status'
import { vi } from '@/messages/vi'

export type MisaFuelMapEntry = {
  productCode: string
  productName: string | null
  warehouseCode: string
  unit: string | null
}

export function MisaFuelMapForm({
  stationId,
  fuelType,
  entry,
}: {
  stationId: string
  fuelType: string
  entry: MisaFuelMapEntry | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [productCode, setProductCode] = useState(entry?.productCode ?? '')
  const [productName, setProductName] = useState(entry?.productName ?? '')
  const [warehouseCode, setWarehouseCode] = useState(entry?.warehouseCode ?? '')
  const [unit, setUnit] = useState(entry?.unit ?? '')

  function reset() {
    setProductCode(entry?.productCode ?? '')
    setProductName(entry?.productName ?? '')
    setWarehouseCode(entry?.warehouseCode ?? '')
    setUnit(entry?.unit ?? '')
  }

  async function submit() {
    if (!productCode.trim() || !warehouseCode.trim()) {
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
        <Button size="sm" variant="ghost">
          {vi.misaSettings.edit}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {vi.misaSettings.editFuelMap} — {fuelTypeLabel(fuelType)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Field>
            <FieldLabel htmlFor="productCode">{vi.misaSettings.productCode}</FieldLabel>
            <Input
              id="productCode"
              value={productCode}
              onChange={(e) => setProductCode(e.target.value)}
            />
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
          <Button onClick={submit} disabled={busy}>
            {vi.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
