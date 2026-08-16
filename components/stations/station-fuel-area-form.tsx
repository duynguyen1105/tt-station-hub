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
  const { busy, save } = useSaveAction()
  // The just-picked vùng, shown immediately so the trigger doesn't sit on the old
  // label through the PATCH + router.refresh. Reverted if the save fails, and
  // dropped the moment the fresh prop arrives (adjust-state-during-render).
  const [optimistic, setOptimistic] = useState<FuelArea | null>(null)
  const [prevFuelArea, setPrevFuelArea] = useState(fuelArea)
  if (fuelArea !== prevFuelArea) {
    setPrevFuelArea(fuelArea)
    setOptimistic(null)
  }
  const shown = optimistic ?? fuelArea

  function pick(next: FuelArea) {
    if (next === shown) return
    // Set outside save() so this is an urgent update and paints in this frame.
    setOptimistic(next)
    save(
      `/api/stations/${stationId}`,
      { method: 'PATCH', body: { fuelArea: next }, success: vi.misaSettings.saved },
      { onError: () => setOptimistic(null) }
    )
  }

  return (
    <Select value={shown} onValueChange={(v) => pick(v as FuelArea)} disabled={busy}>
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
