'use client'

import { toast } from 'sonner'

import { useState } from 'react'

import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { vi } from '@/messages/vi'

/**
 * The station's document requirement ("giấy tờ từ 1-10 ...") pinned above the
 * legal-documents list. Everyone reads it; only the admin gets the edit dialog.
 */
export function DocumentsNote({
  stationId,
  note,
  canEdit,
}: {
  stationId: string
  note: string | null
  canEdit: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState(note ?? '')

  if (!note && !canEdit) return null

  async function save() {
    setBusy(true)
    const res = await fetch(`/api/stations/${stationId}/documents-note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: draft }),
    })
    setBusy(false)
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      toast.error(data?.error ?? vi.errors.generic)
      return
    }
    toast.success(vi.documents.requirementSaved)
    setOpen(false)
    router.refresh()
  }

  return (
    <div className="bg-muted/50 flex items-start justify-between gap-3 rounded-lg border p-3">
      <div className="space-y-1">
        <p className="text-sm font-semibold">{vi.documents.requirementTitle}</p>
        {note ? (
          // The admin writes multiple lines ("1. ...", "2. ...") — keep them.
          <p className="text-sm whitespace-pre-wrap">{note}</p>
        ) : (
          <p className="text-muted-foreground text-sm">{vi.documents.requirementEmpty}</p>
        )}
      </div>
      {canEdit && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              {vi.documents.requirementEdit}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{vi.documents.requirementTitle}</DialogTitle>
            </DialogHeader>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={vi.documents.requirementPlaceholder}
              rows={6}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                {vi.common.cancel}
              </Button>
              <Button onClick={save} disabled={busy}>
                {vi.common.save}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
