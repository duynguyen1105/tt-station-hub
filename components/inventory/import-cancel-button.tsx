'use client'

import { toast } from 'sonner'

import { useState } from 'react'

import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { vi } from '@/messages/vi'

export function ImportCancelButton({ importId }: { importId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function cancel() {
    if (!window.confirm(vi.imports.cancelConfirm)) return
    setBusy(true)
    const res = await fetch(`/api/imports/${importId}/cancel`, { method: 'POST' })
    setBusy(false)
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      toast.error(data?.error ?? vi.errors.generic)
      return
    }
    router.refresh()
  }

  return (
    <Button size="sm" variant="ghost" disabled={busy} onClick={cancel}>
      {vi.imports.cancelAction}
    </Button>
  )
}
