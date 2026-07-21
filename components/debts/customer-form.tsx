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
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { vi } from '@/messages/vi'

export type CustomerFormCustomer = {
  id: string
  name: string
  phone: string | null
  misaCode: string | null
  knownPlates: string[]
}

/**
 * Create/edit dialog for a debt customer. `customer` set → edit mode; otherwise
 * create mode (optionally scoped to a station). `onSaved` receives the API result —
 * the review card uses it to select a just-created walk-in customer inline.
 */
export function CustomerForm({
  customer,
  stationId,
  trigger,
  onSaved,
}: {
  customer?: CustomerFormCustomer
  stationId?: string | null
  trigger: React.ReactNode
  onSaved?: (customer: { id: string; name: string }) => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState(customer?.name ?? '')
  const [phone, setPhone] = useState(customer?.phone ?? '')
  const [misaCode, setMisaCode] = useState(customer?.misaCode ?? '')
  const [plates, setPlates] = useState(customer?.knownPlates.join(', ') ?? '')

  async function save() {
    if (!name.trim()) {
      toast.error(vi.debtReview.customerName + '?')
      return
    }
    // Customer codes are assigned by Trường Thịnh and required (MISA export needs them).
    if (!misaCode.trim()) {
      toast.error(vi.debtReview.customerCodeRequired)
      return
    }
    setBusy(true)
    const body = {
      name: name.trim(),
      phone: phone.trim() || null,
      misaCode: misaCode.trim() || null,
      knownPlates: plates
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean),
      ...(customer ? {} : { stationId: stationId ?? null }),
    }
    const res = await fetch(
      customer ? `/api/debts/customers/${customer.id}` : '/api/debts/customers',
      {
        method: customer ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    )
    setBusy(false)
    if (!res.ok) {
      toast.error(vi.errors.generic)
      return
    }
    const saved = (await res.json().catch(() => null)) as { id?: string; name?: string } | null
    setOpen(false)
    if (!customer) {
      toast.success(vi.debtReview.customerCreated)
      setName('')
      setPhone('')
      setMisaCode('')
      setPlates('')
    }
    if (saved?.id && saved.name) onSaved?.({ id: saved.id, name: saved.name })
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {customer ? vi.debtReview.editCustomer : vi.debtReview.addCustomer}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Field>
            <FieldLabel htmlFor="cust-name">{vi.debtReview.customerName}</FieldLabel>
            <Input id="cust-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="cust-phone">{vi.debtReview.customerPhone}</FieldLabel>
              <Input
                id="cust-phone"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cust-misa">{vi.debtReview.customerCode} *</FieldLabel>
              <Input
                id="cust-misa"
                value={misaCode}
                onChange={(e) => setMisaCode(e.target.value)}
              />
            </Field>
          </div>
          <p className="text-muted-foreground -mt-2 text-xs">{vi.debtReview.customerCodeHint}</p>
          <Field>
            <FieldLabel htmlFor="cust-plates">{vi.debtReview.knownPlates}</FieldLabel>
            <Input
              id="cust-plates"
              value={plates}
              placeholder="50E-753.17, 51C-123.45"
              onChange={(e) => setPlates(e.target.value)}
            />
            <FieldDescription>{vi.debtReview.knownPlatesHint}</FieldDescription>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
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
