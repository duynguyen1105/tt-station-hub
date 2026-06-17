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
import { vi } from '@/messages/vi'

export function PaymentForm({
  customerId,
  customerName,
}: {
  customerId: string
  customerName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [amount, setAmount] = useState('')
  const [txDate, setTxDate] = useState('')
  const [note, setNote] = useState('')

  async function submit() {
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Vui lòng nhập số tiền hợp lệ.')
      return
    }
    if (!txDate) {
      toast.error('Vui lòng chọn ngày.')
      return
    }
    setBusy(true)
    const res = await fetch('/api/debts/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, amount: value, txDate, note: note || undefined }),
    })
    setBusy(false)
    if (res.ok) {
      setOpen(false)
      setAmount('')
      setNote('')
      router.refresh()
    } else {
      const body = await res.json().catch(() => null)
      toast.error(body?.error ?? vi.errors.generic)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {vi.debts.payment}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {vi.debts.payment} — {customerName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Field>
            <FieldLabel htmlFor="amount">{vi.debts.amount}</FieldLabel>
            <Input
              id="amount"
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="txDate">{vi.shifts.date}</FieldLabel>
            <Input
              id="txDate"
              type="date"
              value={txDate}
              onChange={(e) => setTxDate(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="paymentNote">Ghi chú</FieldLabel>
            <Input id="paymentNote" value={note} onChange={(e) => setNote(e.target.value)} />
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
