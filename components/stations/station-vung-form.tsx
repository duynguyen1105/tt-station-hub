'use client'

import { toast } from 'sonner'

import { useState } from 'react'

import { useRouter } from 'next/navigation'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { type Vung } from '@/lib/generated/prisma/client'
import { vi } from '@/messages/vi'

const vungOptions = Object.entries(vi.vung) as [Vung, string][]

export function StationVungForm({ stationId, vung }: { stationId: string; vung: Vung }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function save(next: Vung) {
    if (next === vung) return
    setBusy(true)
    const res = await fetch(`/api/stations/${stationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vung: next }),
    })
    setBusy(false)
    if (res.ok) {
      toast.success(vi.misaSettings.saved)
      router.refresh()
    } else {
      const body = await res.json().catch(() => null)
      toast.error(body?.error ?? vi.errors.generic)
    }
  }

  return (
    <Select value={vung} onValueChange={(v) => save(v as Vung)} disabled={busy}>
      <SelectTrigger className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {vungOptions.map(([v, label]) => (
          <SelectItem key={v} value={v}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
