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
import { vi } from '@/messages/vi'

export type OpeningEntry = {
  fuelType: string
  fuelLabel: string
  openingLiters: number | null
  effectiveDate: string | null // YYYY-MM-DD
}

/**
 * Admin-only dialog to set Trường Thịnh's opening stock (số đầu kỳ) per fuel —
 * the anchor of the whole book-stock ledger, so nobody below admin sees it.
 */
export function OpeningBalanceForm({
  stationId,
  entries,
}: {
  stationId: string
  entries: OpeningEntry[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fuelType, setFuelType] = useState('')
  const [liters, setLiters] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')

  function pickFuel(value: string) {
    setFuelType(value)
    const entry = entries.find((e) => e.fuelType === value)
    setLiters(entry?.openingLiters !== null && entry ? String(entry.openingLiters) : '')
    setEffectiveDate(entry?.effectiveDate ?? '')
  }

  async function save() {
    const litersNumber = Number(liters)
    if (!fuelType) {
      toast.error(vi.imports.selectFuel)
      return
    }
    if (!Number.isFinite(litersNumber) || litersNumber < 0) {
      toast.error(vi.imports.invalidLiters)
      return
    }
    if (!effectiveDate) {
      toast.error(vi.imports.selectDate)
      return
    }
    setBusy(true)
    const res = await fetch('/api/inventory/opening', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stationId, fuelType, openingLiters: litersNumber, effectiveDate }),
    })
    setBusy(false)
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      toast.error(data?.error ?? vi.errors.generic)
      return
    }
    toast.success(vi.inventory.openingSaved)
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {vi.inventory.openingEdit}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{vi.inventory.openingTitle}</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">{vi.inventory.openingNote}</p>
        <div className="grid gap-3">
          <Field>
            <FieldLabel>{vi.inventory.fuelType}</FieldLabel>
            <Select value={fuelType} onValueChange={pickFuel}>
              <SelectTrigger>
                <SelectValue placeholder={vi.inventory.fuelType} />
              </SelectTrigger>
              <SelectContent>
                {entries.map((e) => (
                  <SelectItem key={e.fuelType} value={e.fuelType}>
                    {e.fuelLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>{vi.inventory.openingLiters}</FieldLabel>
            <Input inputMode="decimal" value={liters} onChange={(e) => setLiters(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>{vi.inventory.openingDate}</FieldLabel>
            <Input
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            {vi.common.cancel}
          </Button>
          <Button onClick={save} disabled={busy}>
            {vi.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
