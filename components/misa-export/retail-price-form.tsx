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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { type Vung } from '@/lib/generated/prisma/client'
import { vi } from '@/messages/vi'

const fuelOptions = Object.entries(vi.fuelType)

export function RetailPriceForm({ vung }: { vung: Vung }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fuelType, setFuelType] = useState('DO')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [unitPrice, setUnitPrice] = useState('')

  async function submit() {
    const value = Number(unitPrice)
    if (!Number.isFinite(value) || value <= 0) {
      toast.error(vi.misaSettings.invalidPrice)
      return
    }
    if (!effectiveDate) {
      toast.error(vi.misaSettings.selectDate)
      return
    }
    setBusy(true)
    const res = await fetch('/api/settings/misa/prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vung, fuelType, effectiveDate, unitPrice: value }),
    })
    setBusy(false)
    if (res.ok) {
      setOpen(false)
      setEffectiveDate('')
      setUnitPrice('')
      router.refresh()
    } else {
      const body = await res.json().catch(() => null)
      toast.error(body?.error ?? vi.errors.generic)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">{vi.misaSettings.addPrice}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{vi.misaSettings.addPrice}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Field>
            <FieldLabel>{vi.misaSettings.fuel}</FieldLabel>
            <Select value={fuelType} onValueChange={setFuelType}>
              <SelectTrigger>
                <SelectValue />
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
            <FieldLabel htmlFor="effectiveDate">{vi.misaSettings.effectiveDate}</FieldLabel>
            <Input
              id="effectiveDate"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="unitPrice">{vi.misaSettings.unitPrice}</FieldLabel>
            <Input
              id="unitPrice"
              type="number"
              inputMode="numeric"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
            />
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
