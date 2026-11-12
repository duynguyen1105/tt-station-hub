'use client'

import { toast } from 'sonner'

import { useRef, useState } from 'react'

import { useRouter } from 'next/navigation'

import { uploadReceiptDocs } from '@/components/inventory/upload-receipt-docs'
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
    setBusy(true)
    try {
      await uploadReceiptDocs(receiptId, [{ kind: 'related', files: [...files] }])
    } catch (error) {
      toast.error((error as Error).message)
      router.refresh()
      return
    } finally {
      setBusy(false)
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
