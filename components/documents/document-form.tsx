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
import { vi } from '@/messages/vi'

const docTypeOptions = Object.entries(vi.docType)

export function DocumentForm({ stationId }: { stationId: string }) {
  const router = useRouter()
  const scanRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [docType, setDocType] = useState('business_license')
  const [docName, setDocName] = useState('')
  const [docNumber, setDocNumber] = useState('')
  const [issuedDate, setIssuedDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [issuingAuthority, setIssuingAuthority] = useState('')

  async function submit() {
    if (!docName.trim()) {
      toast.error('Vui lòng nhập tên giấy tờ.')
      return
    }
    setBusy(true)
    const form = new FormData()
    form.set('stationId', stationId)
    form.set('docType', docType)
    form.set('docName', docName)
    if (docNumber) form.set('docNumber', docNumber)
    if (issuedDate) form.set('issuedDate', issuedDate)
    if (expiryDate) form.set('expiryDate', expiryDate)
    if (issuingAuthority) form.set('issuingAuthority', issuingAuthority)
    const scan = scanRef.current?.files?.[0]
    if (scan) form.set('scan', scan)

    const res = await fetch('/api/documents', { method: 'POST', body: form })
    setBusy(false)
    if (res.ok) {
      setOpen(false)
      setDocName('')
      setDocNumber('')
      setIssuedDate('')
      setExpiryDate('')
      setIssuingAuthority('')
      if (scanRef.current) scanRef.current.value = ''
      router.refresh()
    } else {
      toast.error(vi.errors.generic)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">{vi.common.add}</Button>
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
            <FieldLabel htmlFor="docName">{vi.documents.name}</FieldLabel>
            <Input id="docName" value={docName} onChange={(e) => setDocName(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="docNumber">{vi.documents.number}</FieldLabel>
            <Input
              id="docNumber"
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="issuedDate">{vi.documents.signedDate}</FieldLabel>
              <Input
                id="issuedDate"
                type="date"
                value={issuedDate}
                onChange={(e) => setIssuedDate(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="expiryDate">{vi.documents.expiry}</FieldLabel>
              <Input
                id="expiryDate"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="authority">{vi.documents.authority}</FieldLabel>
            <Input
              id="authority"
              value={issuingAuthority}
              onChange={(e) => setIssuingAuthority(e.target.value)}
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
