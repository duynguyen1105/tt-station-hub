'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useSaveAction } from '@/hooks/use-save-action'
import { type StationFuelRemoval } from '@/lib/fuels/catalogue'
import { vi } from '@/messages/vi'

/**
 * What pressing Xóa khỏi trạm on a Map nhiên liệu row opens. It asks the server what
 * the trạm still has for that nhiên liệu before it offers a button, so kế toán either
 * confirms a removal or reads the trụ and the số lít standing in the way — and knows
 * which one to go and clear.
 *
 * The confirm carries the one thing a removal cannot be undone for: an old ca of this
 * nhiên liệu can no longer be re-exported, because the mã hàng goes with the row.
 *
 * Mounted only while it is open, so every opening asks again; the route counts again
 * before it deletes anything, so a stale answer here can never remove a nhiên liệu a
 * trụ went back to pumping.
 */
export function FuelMapRemoveDialog({
  stationId,
  fuelType,
  fuelName,
  onClose,
}: {
  stationId: string
  fuelType: string
  fuelName: string
  onClose: () => void
}) {
  const { busy, save } = useSaveAction()
  // Null until the answer comes back — the button waits rather than offering a removal
  // the trạm may not be allowed to make.
  const [removal, setRemoval] = useState<StationFuelRemoval | null>(null)
  const [loadError, setLoadError] = useState(false)
  const url = `/api/settings/misa/fuel-map/${stationId}/${fuelType}`

  useEffect(() => {
    let cancelled = false
    fetch(url)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: { data: StationFuelRemoval }) => {
        if (!cancelled) setRemoval(body.data)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
    return () => {
      cancelled = true
    }
  }, [url])

  const blocked = removal?.kind === 'blocked'

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{vi.misaSettings.removeFuelMap}</DialogTitle>
          <DialogDescription>
            {removal === null
              ? vi.common.loading
              : blocked
                ? vi.misaSettings.removeFuelMapBlocked(fuelName)
                : vi.misaSettings.removeFuelMapConfirm(fuelName)}
          </DialogDescription>
        </DialogHeader>

        {loadError && (
          <p className="text-destructive text-sm">{vi.misaSettings.fuelMapUsageLoadError}</p>
        )}

        {removal?.kind === 'blocked' && (
          <div className="space-y-3 text-sm">
            <ul className="list-disc space-y-1 pl-5">
              {removal.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <p className="text-muted-foreground">{vi.misaSettings.removeFuelMapBlockedHint}</p>
          </div>
        )}

        {removal?.kind === 'remove' && (
          <p className="text-muted-foreground text-sm">
            {vi.misaSettings.removeFuelMapExportWarning}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {vi.common.cancel}
          </Button>
          <Button
            variant="destructive"
            disabled={removal?.kind !== 'remove'}
            loading={busy}
            onClick={() =>
              save(
                url,
                { method: 'DELETE', success: vi.misaSettings.fuelMapRemoved },
                { onSuccess: onClose }
              )
            }
          >
            {vi.common.delete}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
