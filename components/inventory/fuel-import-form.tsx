'use client'

import { toast } from 'sonner'

import { useRef, useState } from 'react'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { vi } from '@/messages/vi'

export type TankOption = {
  code: string // "HAM_2"
  label: string // "Hầm 2 — Xăng E0 (13K)"
  fuelType: string | null
}

const OTHER_TANK = '__OTHER__'
const fuelOptions = Object.entries(vi.fuelType)

/**
 * "Nhập hàng" dialog: one tanker delivery into one tank, with the temperature /
 * V15 fields (fuel expands with heat, so invoices carry both volumes) and the
 * delivery documents attached as photos/PDFs.
 */
export function FuelImportForm({ stationId, tanks }: { stationId: string; tanks: TankOption[] }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tank, setTank] = useState('')
  const [otherTank, setOtherTank] = useState('')
  const [fuelType, setFuelType] = useState('')
  const [liters, setLiters] = useState('')
  const [litersV15, setLitersV15] = useState('')
  const [temperature, setTemperature] = useState('')
  const [supplier, setSupplier] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [truckPlate, setTruckPlate] = useState('')
  const [note, setNote] = useState('')
  const [importedAt, setImportedAt] = useState('')

  const selected = tanks.find((t) => t.code === tank)
  // The tank fixes the fuel when the mapping is known; otherwise pick manually.
  const effectiveFuel = selected?.fuelType ?? fuelType

  function pickTank(code: string) {
    setTank(code)
    const found = tanks.find((t) => t.code === code)
    if (found?.fuelType) setFuelType(found.fuelType)
  }

  async function submit() {
    const tankCode = tank === OTHER_TANK ? otherTank : tank
    if (!tankCode) {
      toast.error(vi.imports.selectTank)
      return
    }
    if (!effectiveFuel) {
      toast.error(vi.imports.selectFuel)
      return
    }
    const litersNumber = Number(liters)
    if (!Number.isFinite(litersNumber) || litersNumber <= 0) {
      toast.error(vi.imports.invalidLiters)
      return
    }
    if (!importedAt) {
      toast.error(vi.imports.selectDate)
      return
    }

    const form = new FormData()
    form.set('stationId', stationId)
    form.set('tankCode', tankCode)
    form.set('fuelType', effectiveFuel)
    form.set('litersActual', liters)
    if (litersV15) form.set('litersV15', litersV15)
    if (temperature) form.set('temperatureC', temperature)
    if (supplier) form.set('supplier', supplier)
    if (invoiceNo) form.set('invoiceNo', invoiceNo)
    if (truckPlate) form.set('truckPlate', truckPlate)
    if (note) form.set('note', note)
    form.set('importedAt', importedAt)
    for (const file of fileRef.current?.files ?? []) form.append('documents', file)

    setBusy(true)
    const res = await fetch('/api/imports', { method: 'POST', body: form })
    setBusy(false)
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      toast.error(data?.error ?? vi.errors.generic)
      return
    }
    toast.success(vi.imports.saved)
    setOpen(false)
    setTank('')
    setOtherTank('')
    setLiters('')
    setLitersV15('')
    setTemperature('')
    setSupplier('')
    setInvoiceNo('')
    setTruckPlate('')
    setNote('')
    setImportedAt('')
    if (fileRef.current) fileRef.current.value = ''
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">{vi.imports.addButton}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{vi.imports.title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel>{vi.imports.tank}</FieldLabel>
            <Select value={tank} onValueChange={pickTank}>
              <SelectTrigger>
                <SelectValue placeholder={vi.imports.tank} />
              </SelectTrigger>
              <SelectContent>
                {tanks.map((t) => (
                  <SelectItem key={t.code} value={t.code}>
                    {t.label}
                  </SelectItem>
                ))}
                <SelectItem value={OTHER_TANK}>{vi.imports.otherTank}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {tank === OTHER_TANK ? (
            <Field>
              <FieldLabel>{vi.imports.otherTankCode}</FieldLabel>
              <Input
                value={otherTank}
                onChange={(e) => setOtherTank(e.target.value)}
                placeholder="HAM 5"
              />
            </Field>
          ) : null}
          <Field>
            <FieldLabel>{vi.inventory.fuelType}</FieldLabel>
            <Select
              value={effectiveFuel}
              onValueChange={setFuelType}
              disabled={!!selected?.fuelType}
            >
              <SelectTrigger>
                <SelectValue placeholder={vi.inventory.fuelType} />
              </SelectTrigger>
              <SelectContent>
                {fuelOptions.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>{vi.imports.liters}</FieldLabel>
            <Input inputMode="decimal" value={liters} onChange={(e) => setLiters(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>{vi.imports.litersV15}</FieldLabel>
            <Input
              inputMode="decimal"
              value={litersV15}
              onChange={(e) => setLitersV15(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>{vi.imports.temperature}</FieldLabel>
            <Input
              inputMode="decimal"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>{vi.imports.importedAt}</FieldLabel>
            <Input
              type="datetime-local"
              value={importedAt}
              onChange={(e) => setImportedAt(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>{vi.imports.supplier}</FieldLabel>
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>{vi.imports.invoiceNo}</FieldLabel>
            <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>{vi.imports.truckPlate}</FieldLabel>
            <Input value={truckPlate} onChange={(e) => setTruckPlate(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>{vi.imports.note}</FieldLabel>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel>{vi.imports.documents}</FieldLabel>
            <Input ref={fileRef} type="file" multiple accept="image/*,.pdf" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
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
