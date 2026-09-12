'use client'

import { useState } from 'react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSaveAction } from '@/hooks/use-save-action'
import { LITERS_DECIMALS_OPTIONS, type LitersDecimals } from '@/lib/debts/liters-decimals'
import { vi } from '@/messages/vi'

export function StationLitersDecimalsForm({
  stationId,
  litersDecimals,
}: {
  stationId: string
  litersDecimals: number
}) {
  const { busy, save } = useSaveAction()
  // Same optimistic shape as StationFuelAreaForm: paint the pick now, revert on failure.
  const [optimistic, setOptimistic] = useState<number | null>(null)
  const [prev, setPrev] = useState(litersDecimals)
  if (litersDecimals !== prev) {
    setPrev(litersDecimals)
    setOptimistic(null)
  }
  const shown = optimistic ?? litersDecimals

  function pick(next: LitersDecimals) {
    if (next === shown) return
    setOptimistic(next)
    save(
      `/api/stations/${stationId}`,
      { method: 'PATCH', body: { litersDecimals: next }, success: vi.misaSettings.saved },
      { onError: () => setOptimistic(null) }
    )
  }

  return (
    <Select
      value={String(shown)}
      onValueChange={(v) => pick(Number(v) as LitersDecimals)}
      disabled={busy}
    >
      <SelectTrigger className="w-72">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LITERS_DECIMALS_OPTIONS.map((n) => (
          <SelectItem key={n} value={String(n)}>
            {vi.stations.litersDecimalsOption(n)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
