'use client'

import { useState } from 'react'

import { PhotoView } from '@/components/shared/photo-view'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSaveAction } from '@/hooks/use-save-action'
import { type RouterResult } from '@/lib/ai/types'
import { type MeterSlot } from '@/lib/matching/photo-to-reading'
import { type UnmatchedReason } from '@/lib/photos/unmatched-photos'
import { vi } from '@/messages/vi'

export type UnmatchedPhotoData = {
  id: string
  url: string | null
  /** Pre-formatted on the server, so the row renders the same time the rest of the page does. */
  receivedAt: string
  /** What the router called the frame, when it answered. */
  routerType: RouterResult['image_type'] | null
  reason: UnmatchedReason | null
  notes: string | null
  error: string | null
  /** The number the shift reader got off it, if any — shown so the reviewer can sanity-check before gán. */
  extractedReading: string | null
}

export type AssignableDispenser = {
  id: string
  name: string
  hasElectronicMeter: boolean
  hasMechanicalMeter: boolean
}

/**
 * The photos of a ca the AI could not put on any Trụ — a mechanical window the
 * router missed, a plate-less LCD, a declared-debt photo that was neither half
 * of a fill, a pass that threw. Each row says what the AI saw and why it stopped,
 * and lets the reviewer gán the photo to a Trụ + đồng hồ; the number is then read
 * again into that row exactly as a recognised photo would have been.
 */
export function UnmatchedPhotos({
  photos,
  dispensers,
  canAssign,
}: {
  photos: UnmatchedPhotoData[]
  dispensers: AssignableDispenser[]
  canAssign: boolean
}) {
  if (photos.length === 0) return null
  return (
    <section className="space-y-2">
      <h3 className="text-base font-semibold">
        {vi.unmatchedPhotos.title} ({photos.length})
      </h3>
      <p className="text-muted-foreground text-sm">{vi.unmatchedPhotos.description}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left">
            <th className="p-2">{vi.shifts.debtPhotos}</th>
            <th className="p-2">{vi.unmatchedPhotos.receivedAt}</th>
            <th className="p-2">{vi.unmatchedPhotos.aiSaw}</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {photos.map((photo) => (
            <UnmatchedPhotoRow
              key={photo.id}
              photo={photo}
              dispensers={dispensers}
              canAssign={canAssign}
            />
          ))}
        </tbody>
      </table>
    </section>
  )
}

function UnmatchedPhotoRow({
  photo,
  dispensers,
  canAssign,
}: {
  photo: UnmatchedPhotoData
  dispensers: AssignableDispenser[]
  canAssign: boolean
}) {
  const { busy, save } = useSaveAction()
  const [dispenserId, setDispenserId] = useState<string>('')
  // The router's own guess seeds the slot; the reviewer corrects it (report #7:
  // the mechanical window it called something else).
  const [slot, setSlot] = useState<MeterSlot>(
    photo.routerType === 'mechanical_meter' ? 'mechanical' : 'electronic'
  )
  const dispenser = dispensers.find((d) => d.id === dispenserId)
  const slotOffered =
    dispenser !== undefined &&
    (slot === 'electronic' ? dispenser.hasElectronicMeter : dispenser.hasMechanicalMeter)

  function assign() {
    save(`/api/photos/${photo.id}/assign`, {
      body: { dispenserId, slot },
      success: vi.unmatchedPhotos.assigned,
    })
  }

  const label = photo.routerType
    ? vi.unmatchedPhotos.routerType[photo.routerType]
    : vi.unmatchedPhotos.reason.extraction_failed

  return (
    <tr className="border-b align-top">
      <td className="p-2">
        <PhotoView
          url={photo.url}
          label={
            photo.extractedReading !== null
              ? `${label} — ${vi.correction.aiRead}: ${photo.extractedReading}`
              : label
          }
        />
      </td>
      <td className="p-2 whitespace-nowrap">{photo.receivedAt}</td>
      <td className="space-y-1 p-2">
        <div className="flex flex-wrap items-center gap-1">
          <StatusBadge label={label} tone="muted" />
          {photo.extractedReading !== null && (
            <span className="font-mono">{photo.extractedReading}</span>
          )}
        </div>
        {photo.reason && (
          <div className="text-xs text-amber-700 dark:text-amber-400">
            {vi.unmatchedPhotos.reason[photo.reason]}
          </div>
        )}
        {photo.notes && (
          <div className="text-muted-foreground text-xs">
            {vi.unmatchedPhotos.aiNotes}: {photo.notes}
          </div>
        )}
        {photo.error && <div className="text-destructive text-xs">{photo.error}</div>}
      </td>
      <td className="p-2">
        {canAssign && (
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Select value={dispenserId} onValueChange={setDispenserId} disabled={busy}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder={vi.unmatchedPhotos.pickDispenser} />
              </SelectTrigger>
              <SelectContent>
                {dispensers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={slot} onValueChange={(v) => setSlot(v as MeterSlot)} disabled={busy}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="electronic" disabled={dispenser?.hasElectronicMeter === false}>
                  {vi.shifts.electronic}
                </SelectItem>
                <SelectItem value="mechanical" disabled={dispenser?.hasMechanicalMeter === false}>
                  {vi.shifts.mechanical}
                </SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !slotOffered}
              loading={busy}
              onClick={assign}
            >
              {vi.unmatchedPhotos.assign}
            </Button>
          </div>
        )}
      </td>
    </tr>
  )
}
