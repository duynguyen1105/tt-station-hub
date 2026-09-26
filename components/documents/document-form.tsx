'use client'

import { toast } from 'sonner'

import { useRef, useState } from 'react'

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
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSaveAction } from '@/hooks/use-save-action'
import { vi } from '@/messages/vi'

const docTypeOptions = Object.entries(vi.docType)

export function DocumentForm({
  stationId,
  document,
}: {
  stationId: string
  document?: {
    id: string
    docType: string
    docName: string
    docNumber: string | null
    issuedDate: string | null
    expiryDate: string | null
    issuingAuthority: string | null
    notes: string | null
  }
}) {
  const router = useRouter()
  const scanRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [docType, setDocType] = useState(document?.docType ?? 'business_license')
  const [docName, setDocName] = useState(document?.docName ?? '')
  const [docNumber, setDocNumber] = useState(document?.docNumber ?? '')
  const [issuedDate, setIssuedDate] = useState(document?.issuedDate ?? '')
  const [expiryDate, setExpiryDate] = useState(document?.expiryDate ?? '')
  const [issuingAuthority, setIssuingAuthority] = useState(document?.issuingAuthority ?? '')
  const [notes, setNotes] = useState(document?.notes ?? '')

  async function submit() {
    if (!docName.trim()) {
      toast.error(vi.documents.missingName)
      return
    }
    setBusy(true)
    const form = new FormData()
    form.set('stationId', stationId)
    form.set('docType', docType)
    form.set('docName', docName)
    if (document || docNumber) form.set('docNumber', docNumber)
    if (document || issuedDate) form.set('issuedDate', issuedDate)
    if (document || expiryDate) form.set('expiryDate', expiryDate)
    if (document || issuingAuthority) form.set('issuingAuthority', issuingAuthority)
    if (document || notes) form.set('notes', notes)
    const scan = scanRef.current?.files?.[0]
    if (scan) form.set('scan', scan)

    const res = await fetch(document ? `/api/documents/${document.id}` : '/api/documents', {
      method: document ? 'PATCH' : 'POST',
      body: form,
    })
    setBusy(false)
    if (res.ok) {
      if (document) toast.success(vi.documents.saved)
      setOpen(false)
      if (!document) {
        setDocName('')
        setDocNumber('')
        setIssuedDate('')
        setExpiryDate('')
        setIssuingAuthority('')
        setNotes('')
      }
      if (scanRef.current) scanRef.current.value = ''
      router.refresh()
    } else {
      const data = await res.json().catch(() => null)
      toast.error(data?.error ?? vi.errors.generic)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={document ? 'ghost' : 'default'}>
          {document ? vi.common.edit : vi.common.add}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{vi.documents.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Field>
            <FieldLabel>{vi.documents.type}</FieldLabel>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {docTypeOptions.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor={`docName-${document?.id ?? 'new'}`}>
              {vi.documents.name}
            </FieldLabel>
            <Input
              id={`docName-${document?.id ?? 'new'}`}
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`docNumber-${document?.id ?? 'new'}`}>
              {vi.documents.number}
            </FieldLabel>
            <Input
              id={`docNumber-${document?.id ?? 'new'}`}
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor={`issuedDate-${document?.id ?? 'new'}`}>
                {vi.documents.signedDate}
              </FieldLabel>
              <Input
                id={`issuedDate-${document?.id ?? 'new'}`}
                type="date"
                value={issuedDate}
                onChange={(e) => setIssuedDate(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`expiryDate-${document?.id ?? 'new'}`}>
                {vi.documents.expiry}
              </FieldLabel>
              <Input
                id={`expiryDate-${document?.id ?? 'new'}`}
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor={`authority-${document?.id ?? 'new'}`}>
              {vi.documents.authority}
            </FieldLabel>
            <Input
              id={`authority-${document?.id ?? 'new'}`}
              value={issuingAuthority}
              onChange={(e) => setIssuingAuthority(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`notes-${document?.id ?? 'new'}`}>{vi.documents.notes}</FieldLabel>
            <Input
              id={`notes-${document?.id ?? 'new'}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>{vi.documents.scan}</FieldLabel>
            <Input ref={scanRef} type="file" accept="image/*,.pdf" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {vi.common.cancel}
          </Button>
          <Button onClick={submit} loading={busy}>
            {vi.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DocumentDelete({ id }: { id: string }) {
  const { busy, save } = useSaveAction()
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={busy}
      onClick={() => {
        if (window.confirm(vi.documents.confirmDelete))
          save(`/api/documents/${id}`, { method: 'DELETE', success: vi.documents.deleted })
      }}
    >
      {vi.common.delete}
    </Button>
  )
}
