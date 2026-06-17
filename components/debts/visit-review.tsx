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

export type VisitReviewData = {
  visitId: string
  plate: string
  liters: string
  unitPrice: string
  customerId: string
  customers: { id: string; name: string }[]
}

const UNASSIGNED = '__none__'

async function post(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function VisitReview({ data }: { data: VisitReviewData }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [customerId, setCustomerId] = useState(data.customerId || UNASSIGNED)
  const [plate, setPlate] = useState(data.plate)
  const [liters, setLiters] = useState(data.liters)
  const [unitPrice, setUnitPrice] = useState(data.unitPrice)

  async function approve() {
    if (customerId === UNASSIGNED) {
      toast.error('Vui lòng chọn khách hàng trước khi duyệt.')
      return
    }
    setBusy(true)
    const res = await post(`/api/debts/visits/${data.visitId}/approve`, { customerId })
    setBusy(false)
    if (res.ok) router.refresh()
    else {
      const body = await res.json().catch(() => null)
      toast.error(body?.error ?? vi.errors.generic)
    }
  }

  async function saveCorrection() {
    setBusy(true)
    const res = await post(`/api/debts/visits/${data.visitId}/correct`, {
      plateConfirmed: plate || null,
      litersRead: liters ? Number(liters) : null,
      unitPriceRead: unitPrice ? Number(unitPrice) : null,
      customerId: customerId === UNASSIGNED ? null : customerId,
    })
    setBusy(false)
    if (res.ok) {
      setOpen(false)
      router.refresh()
    } else {
      toast.error(vi.errors.generic)
    }
  }

  return (
    <div className="inline-flex items-center gap-1">
      <Select value={customerId} onValueChange={setCustomerId}>
        <SelectTrigger className="h-8 w-36">
          <SelectValue placeholder={vi.debts.customer} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNASSIGNED}>—</SelectItem>
          {data.customers.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" disabled={busy} onClick={approve}>
        {vi.common.approve}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="ghost" disabled={busy}>
            {vi.common.correct}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{vi.review.debtsTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field>
              <FieldLabel htmlFor="plate">{vi.debts.plate}</FieldLabel>
              <Input id="plate" value={plate} onChange={(e) => setPlate(e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="liters">{vi.debts.liters}</FieldLabel>
                <Input
                  id="liters"
                  inputMode="decimal"
                  value={liters}
                  onChange={(e) => setLiters(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="unitPrice">{vi.debts.unitPrice}</FieldLabel>
                <Input
                  id="unitPrice"
                  inputMode="numeric"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {vi.common.cancel}
            </Button>
            <Button onClick={saveCorrection} disabled={busy}>
              {vi.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
