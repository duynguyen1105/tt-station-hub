'use client'

import { toast } from 'sonner'

import { useState } from 'react'

import { useRouter } from 'next/navigation'

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
    <Button onClick={complete} disabled={busy || disabled}>
      {busy ? vi.shifts.completing : vi.shifts.complete}
    </Button>
  )
}
