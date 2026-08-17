'use client'

import { toast } from 'sonner'

import { useRef, useState } from 'react'

import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { vi } from '@/messages/vi'

/**
 * Adds more "tài liệu nhập hàng" (invoices, export slips, seals, tanker
 * gauges...) to an already-saved biên bản — the wizard's step 3 is the first
 * chance to attach them, this is every later one.
 */
export function ReceiptDocUpload({ receiptId }: { receiptId: string }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function upload() {
    const files = fileRef.current?.files ?? []
    if (files.length === 0) {
      toast.error(vi.imports.selectDocs)
      return
    }
    const form = new FormData()
    for (const file of files) form.append('photos', file)
    setBusy(true)
    const res = await fetch(`/api/imports/receipts/${receiptId}/documents`, {
      method: 'POST',
      body: form,
    })
    setBusy(false)
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      toast.error(data?.error ?? vi.errors.generic)
      return
    }
    toast.success(vi.imports.relatedSaved)
    if (fileRef.current) fileRef.current.value = ''
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input ref={fileRef} type="file" multiple accept="image/*,.pdf" className="max-w-xs" />
      <Button size="sm" onClick={upload} loading={busy}>
        {busy ? vi.imports.uploading : vi.imports.addDocs}
      </Button>
    </div>
  )
}
