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

export type MisaConfigValues = {
  revenueAccount: string
  costAccount: string
  stockAccount: string
  creditDebitAccount: string
  cashDebitAccount: string
}

const FIELDS = [
  { key: 'revenueAccount', label: vi.misaSettings.revenueAccount },
  { key: 'costAccount', label: vi.misaSettings.costAccount },
  { key: 'stockAccount', label: vi.misaSettings.stockAccount },
  { key: 'creditDebitAccount', label: vi.misaSettings.creditDebitAccount },
  { key: 'cashDebitAccount', label: vi.misaSettings.cashDebitAccount },
] as const

const EMPTY: MisaConfigValues = {
  revenueAccount: '',
  costAccount: '',
  stockAccount: '',
  creditDebitAccount: '',
  cashDebitAccount: '',
}

export function MisaConfigForm({
  stationId,
  config,
}: {
  stationId: string
  config: MisaConfigValues | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [values, setValues] = useState<MisaConfigValues>(config ?? EMPTY)

  function setField(key: keyof MisaConfigValues, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function submit() {
    const trimmed = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, v.trim()])
    ) as MisaConfigValues
    if (Object.values(trimmed).some((v) => v === '')) {
      toast.error(vi.errors.generic)
      return
    }
    setBusy(true)
    const res = await fetch('/api/settings/misa/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stationId, ...trimmed }),
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
        if (next) setValues(config ?? EMPTY)
        setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">{vi.misaSettings.editConfig}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{vi.misaSettings.editConfig}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {FIELDS.map(({ key, label }) => (
            <Field key={key}>
              <FieldLabel htmlFor={key}>{label}</FieldLabel>
              <Input id={key} value={values[key]} onChange={(e) => setField(key, e.target.value)} />
            </Field>
          ))}
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
