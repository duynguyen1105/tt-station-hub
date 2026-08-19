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
import type { CatalogueFuel, FuelRemoval } from '@/lib/fuels/catalogue'
import { vi } from '@/messages/vi'

/**
 * What pressing Xoá on a nhiên liệu opens. It asks the server what is using the nhiên
 * liệu before it offers a button, so kế toán reads one of two different things: a nhiên
 * liệu added by mistake this morning is simply gone, and one Trường Thịnh has been
 * selling for two years cannot be deleted at all — the dialog turns into Ngừng sử dụng
 * and lists what is holding it.
 *
 * Mounted only while it is open, so every opening asks again: a giá or a map written
 * since last time changes the answer. The server counts again before it deletes
 * anything, so a stale answer here can never orphan a row.
 */
export function FuelRemoveDialog({ fuel, onClose }: { fuel: CatalogueFuel; onClose: () => void }) {
  const { busy, save } = useSaveAction()
  // Null until the counts come back — the button waits for the answer rather than
  // guessing which of the two actions it is.
  const [removal, setRemoval] = useState<FuelRemoval | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/settings/misa/fuels/${fuel.fuelType}/usage`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: { data: FuelRemoval }) => {
        if (!cancelled) setRemoval(body.data)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
    return () => {
      cancelled = true
    }
  }, [fuel.fuelType])

  function submit() {
    if (removal === null) return
    save(
      removal.kind === 'delete'
        ? `/api/settings/misa/fuels/${fuel.fuelType}`
        : `/api/settings/misa/fuels/${fuel.fuelType}/active`,
      removal.kind === 'delete'
        ? { method: 'DELETE', success: vi.misaSettings.fuelDeleted }
        : {
            method: 'PATCH',
            body: { isActive: false },
            success: vi.misaSettings.fuelDeactivated,
          },
      { onSuccess: onClose }
    )
  }

  const deactivating = removal?.kind === 'deactivate'

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {deactivating ? vi.misaSettings.deactivateFuel : vi.misaSettings.deleteFuel}
          </DialogTitle>
          <DialogDescription>
            {removal === null
              ? vi.common.loading
              : removal.kind === 'delete'
                ? vi.misaSettings.fuelUnused(fuel.name)
                : vi.misaSettings.fuelInUse(fuel.name)}
          </DialogDescription>
        </DialogHeader>

        {loadError && (
          <p className="text-destructive text-sm">{vi.misaSettings.fuelUsageLoadError}</p>
        )}

        {removal?.kind === 'deactivate' && (
          <div className="space-y-3 text-sm">
            <ul className="list-disc space-y-1 pl-5">
              {removal.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <p className="text-muted-foreground">{vi.misaSettings.fuelDeactivateHint}</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {vi.common.cancel}
          </Button>
          <Button
            variant={deactivating ? 'default' : 'destructive'}
            disabled={removal === null}
            loading={busy}
            onClick={submit}
          >
            {deactivating ? vi.misaSettings.deactivateFuel : vi.common.delete}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
