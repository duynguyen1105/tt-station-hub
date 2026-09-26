'use client'

import { toast } from 'sonner'

import { useState } from 'react'

import { useRouter } from 'next/navigation'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { vi } from '@/messages/vi'

export function ShiftCompleteButton({
  shiftId,
  disabled,
}: {
  shiftId: string
  disabled?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function complete() {
    setBusy(true)
    const res = await fetch(`/api/shifts/${shiftId}/complete`, { method: 'POST' })
    setBusy(false)
    if (res.ok) {
      toast.success(vi.shifts.complete)
      router.refresh()
    } else {
      const body = await res.json().catch(() => null)
      toast.error(body?.error ?? vi.errors.generic)
    }
  }

  return (
    <Button onClick={complete} loading={busy} disabled={disabled}>
      {busy ? vi.shifts.completing : vi.shifts.complete}
    </Button>
  )
}

export function ShiftReopenButton({ shiftId }: { shiftId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)

  async function reopen() {
    setBusy(true)
    try {
      const res = await fetch(`/api/shifts/${shiftId}/reopen`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        toast.error(body?.error ?? vi.errors.generic)
        return
      }
      setOpen(false)
      toast.success(vi.shifts.reopened)
      router.refresh()
    } catch {
      toast.error(vi.errors.generic)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline">{vi.shifts.reopen}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{vi.shifts.reopenTitle}</AlertDialogTitle>
          <AlertDialogDescription>{vi.shifts.reopenBody}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{vi.common.cancel}</AlertDialogCancel>
          <AlertDialogAction
            loading={busy}
            onClick={(event) => {
              event.preventDefault()
              void reopen()
            }}
          >
            {busy ? vi.shifts.reopening : vi.shifts.reopen}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
