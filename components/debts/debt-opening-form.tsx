'use client'

import { toast } from 'sonner'

import { useId, useState } from 'react'

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
import { vi } from '@/messages/vi'

/** Admin-only dialog to set a khách hàng's nợ đầu kỳ — the anchor of their sổ công nợ. */
export function DebtOpeningForm({
  customerId,
  customerName,
  openingBalance,
  openingDate,
  today,
}: {
  customerId: string
  customerName: string
  openingBalance: number
  openingDate: string | null
  today: string
}) {
  const router = useRouter()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [amount, setAmount] = useState(openingBalance !== 0 ? String(openingBalance) : '')
  const [date, setDate] = useState(openingDate ?? today)

  async function save() {
    const digits = amount.replace(/[.,\s]/g, '')
    const value = Number(digits)
    if (!/^-?\d+$/.test(digits) || !Number.isSafeInteger(value)) {
      toast.error(vi.debts.openingInvalid)
      return
    }
    setBusy(true)
    const res = await fetch(`/api/debts/customers/${customerId}/opening`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ openingBalance: value, openingDate: date }),
    })
    setBusy(false)
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      toast.error(data?.error ?? vi.errors.generic)
      return
    }
    toast.success(vi.debts.openingSaved)
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          {vi.debts.openingEdit}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{vi.debts.openingTitle(customerName)}</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">{vi.debts.openingNote}</p>
        <div className="grid gap-3">
          <Field>
            <FieldLabel htmlFor={`${id}-amount`}>{vi.debts.openingAmount}</FieldLabel>
            <Input
              id={`${id}-amount`}
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-date`}>{vi.debts.openingDate}</FieldLabel>
            <Input
              id={`${id}-date`}
              type="date"
              max={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            {vi.common.cancel}
          </Button>
          <Button onClick={save} loading={busy}>
            {vi.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
