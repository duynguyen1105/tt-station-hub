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
import { type FuelArea } from '@/lib/generated/prisma/client'
import { vi } from '@/messages/vi'

const fuelAreaOptions = Object.entries(vi.fuelArea) as [FuelArea, string][]

export function StationFuelAreaForm({
  stationId,
  fuelArea,
}: {
  stationId: string
  fuelArea: FuelArea
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function save(next: FuelArea) {
    if (next === fuelArea) return
    setBusy(true)
    const res = await fetch(`/api/stations/${stationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fuelArea: next }),
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
    <Select value={fuelArea} onValueChange={(v) => save(v as FuelArea)} disabled={busy}>
      <SelectTrigger className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {fuelAreaOptions.map(([v, label]) => (
          <SelectItem key={v} value={v}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
