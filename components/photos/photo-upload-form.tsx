'use client'

import { CheckCircle2, ImageUp, Loader2, TriangleAlert, X } from 'lucide-react'
import { toast } from 'sonner'

import { useEffect, useRef, useState } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formatVND } from '@/lib/format'
import { cn } from '@/lib/utils'
import { vi } from '@/messages/vi'

type Station = { id: string; code: string; name: string }
type Dispenser = { id: string; stationId: string; displayName: string; fuelType: string }

type ShiftRead = {
  meterType: string
  reading: string | null
  dispenserLabel: string | null
  fuelType: string | null
  readingConfidence: number | null
  notes: string
}

type DebtRead = {
  meterType: string
  liters: string | null
  unitPrice: string | null
  computedAmount: number | null
  amountMatchesDisplay: boolean | null
  amountConfidence: number | null
  notes: string
}

type UploadResult = {
  kind: 'shift' | 'debt'
  shiftId: string | null
  shift: ShiftRead | null
  debt: DebtRead | null
  extractionError: string | null
}

function meterLabel(type: string | null | undefined): string {
  if (!type) return vi.upload.empty
  return vi.meterTypeLabel[type] ?? type
}

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="readout text-muted-foreground">{vi.upload.empty}</span>
  const tone =
    value >= 90
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
      : value >= 70
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
        : 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400'
  return (
    <span className={cn('readout rounded-md border px-2 py-0.5 text-sm font-semibold', tone)}>
      {value}%
    </span>
  )
}

function ReadoutRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dashed py-2 last:border-0">
      <span className="label-micro text-muted-foreground">{label}</span>
      <span className="readout text-foreground text-right font-medium">{children}</span>
    </div>
  )
}

export function PhotoUploadForm({
  stations,
  dispensers,
}: {
  stations: Station[]
  dispensers: Dispenser[]
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)
  const [stationId, setStationId] = useState(stations[0]?.id ?? '')
  const [kind, setKind] = useState<'auto' | 'shift' | 'debt'>('auto')
  const [dispenserId, setDispenserId] = useState('') // '' = auto (match by AI label)
  const [meterSlot, setMeterSlot] = useState<'auto' | 'electronic' | 'mechanical'>('auto')
  const [caption, setCaption] = useState('')

  const stationDispensers = dispensers.filter((d) => d.stationId === stationId)

  function onStationChange(next: string) {
    setStationId(next)
    setDispenserId('') // pumps differ per station — reset the manual assignment
  }
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)

  // Revoke the last object URL when the component unmounts.
  useEffect(
    () => () => void (previewUrlRef.current && URL.revokeObjectURL(previewUrlRef.current)),
    []
  )

  function pickFile(next: File | null) {
    setResult(null)
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const url = next ? URL.createObjectURL(next) : null
    previewUrlRef.current = url
    setPreviewUrl(url)
    setFile(next)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) pickFile(dropped)
  }

  async function submit() {
    if (!stationId) {
      toast.error(vi.upload.noStations)
      return
    }
    if (!file) {
      toast.error(vi.upload.dropHint)
      return
    }
    setBusy(true)
    setResult(null)

    const body = new FormData()
    body.append('file', file)
    body.append('stationId', stationId)
    if (kind !== 'auto') body.append('kind', kind)
    if (dispenserId) body.append('dispenserId', dispenserId)
    if (dispenserId && meterSlot !== 'auto') body.append('meterSlot', meterSlot)
    if (caption.trim()) body.append('caption', caption.trim())

    try {
      const res = await fetch('/api/photos', { method: 'POST', body })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(json?.error ?? vi.errors.generic)
        return
      }
      setResult(json.data as UploadResult)
      toast.success(vi.upload.uploaded)
      router.refresh()
    } catch {
      toast.error(vi.errors.generic)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="relative overflow-hidden">
        <span className="bg-brass absolute inset-x-0 top-0 h-1" />
        <CardHeader className="pt-5">
          <CardTitle className="text-base">{vi.upload.photo}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel>{vi.upload.station}</FieldLabel>
            <Select
              value={stationId}
              onValueChange={onStationChange}
              disabled={stations.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={vi.upload.selectStation} />
              </SelectTrigger>
              <SelectContent>
                {stations.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} · {s.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {stations.length === 0 && (
              <p className="text-muted-foreground mt-1 text-xs">{vi.upload.noStations}</p>
            )}
          </Field>

          <Field>
            <FieldLabel>{vi.upload.kind}</FieldLabel>
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{vi.upload.kindAuto}</SelectItem>
                <SelectItem value="shift">{vi.upload.kindShift}</SelectItem>
                <SelectItem value="debt">{vi.upload.kindDebt}</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {kind !== 'debt' && stationDispensers.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>{vi.upload.assignPump}</FieldLabel>
                <Select
                  value={dispenserId || 'auto'}
                  onValueChange={(v) => setDispenserId(v === 'auto' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{vi.upload.pumpAuto}</SelectItem>
                    {stationDispensers.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.displayName} · {d.fuelType}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>{vi.upload.slotLabel}</FieldLabel>
                <Select
                  value={meterSlot}
                  onValueChange={(v) => setMeterSlot(v as typeof meterSlot)}
                  disabled={!dispenserId}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{vi.upload.slotAuto}</SelectItem>
                    <SelectItem value="electronic">{vi.upload.slotElectronic}</SelectItem>
                    <SelectItem value="mechanical">{vi.upload.slotMechanical}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {dispenserId && (
                <p className="text-muted-foreground col-span-2 -mt-1 text-xs">
                  {vi.upload.pumpHint}
                </p>
              )}
            </div>
          )}

          <Field>
            <FieldLabel>{vi.upload.photo}</FieldLabel>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            {previewUrl ? (
              <div className="group relative overflow-hidden rounded-lg border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="" className="max-h-72 w-full object-contain" />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-2">
                  <span className="truncate text-xs text-white/90">{file?.name}</span>
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {vi.upload.changePhoto}
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      onClick={() => pickFile(null)}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                className="border-input hover:border-primary hover:bg-muted/40 flex h-44 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center transition-colors"
              >
                <ImageUp className="text-muted-foreground size-7" />
                <span className="text-muted-foreground text-sm">{vi.upload.dropHint}</span>
              </button>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="caption">{vi.upload.caption}</FieldLabel>
            <Textarea
              id="caption"
              rows={2}
              value={caption}
              placeholder={vi.upload.captionHint}
              onChange={(e) => setCaption(e.target.value)}
            />
          </Field>

          <Button className="w-full" onClick={submit} disabled={busy || !file || !stationId}>
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {vi.upload.uploading}
              </>
            ) : (
              vi.upload.submit
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden">
        <span className="bg-primary absolute inset-x-0 top-0 h-1" />
        <CardHeader className="pt-5">
          <CardTitle className="text-base">{vi.upload.resultTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {!result && (
            <p className="text-muted-foreground py-10 text-center text-sm">
              {busy ? vi.upload.uploading : vi.upload.empty}
            </p>
          )}

          {result?.extractionError && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{vi.upload.extractionFailed}</span>
            </div>
          )}

          {result?.shift && (
            <div>
              <div className="mb-3 flex items-baseline justify-between">
                <span className="label-micro text-muted-foreground">{vi.upload.reading}</span>
                <span className="readout text-foreground text-3xl font-bold">
                  {result.shift.reading ?? vi.upload.empty}
                </span>
              </div>
              <ReadoutRow label={vi.upload.meterType}>
                {meterLabel(result.shift.meterType)}
              </ReadoutRow>
              <ReadoutRow label={vi.upload.dispenser}>
                {result.shift.dispenserLabel ?? vi.upload.empty}
              </ReadoutRow>
              <ReadoutRow label={vi.upload.fuel}>
                {result.shift.fuelType ?? vi.upload.empty}
              </ReadoutRow>
              <ReadoutRow label={vi.upload.confidence}>
                <ConfidenceBadge value={result.shift.readingConfidence} />
              </ReadoutRow>
              {result.shift.notes && (
                <p className="text-muted-foreground mt-3 text-xs italic">{result.shift.notes}</p>
              )}
            </div>
          )}

          {result?.debt && (
            <div>
              <div className="mb-3 flex items-baseline justify-between">
                <span className="label-micro text-muted-foreground">{vi.upload.amount}</span>
                <span className="readout text-foreground text-3xl font-bold">
                  {result.debt.computedAmount != null
                    ? formatVND(result.debt.computedAmount)
                    : vi.upload.empty}
                </span>
              </div>
              <ReadoutRow label={vi.upload.liters}>
                {result.debt.liters ?? vi.upload.empty}
              </ReadoutRow>
              <ReadoutRow label={vi.upload.unitPrice}>
                {result.debt.unitPrice ?? vi.upload.empty}
              </ReadoutRow>
              <ReadoutRow label={vi.upload.confidence}>
                <ConfidenceBadge value={result.debt.amountConfidence} />
              </ReadoutRow>
              <div className="mt-3">
                {result.debt.amountMatchesDisplay === false ? (
                  <Badge
                    variant="outline"
                    className="border-rose-500/40 text-rose-700 dark:text-rose-400"
                  >
                    <TriangleAlert className="size-3.5" />
                    {vi.upload.amountMismatch}
                  </Badge>
                ) : result.debt.amountMatchesDisplay === true ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                  >
                    <CheckCircle2 className="size-3.5" />
                    {vi.upload.amountMatch}
                  </Badge>
                ) : null}
              </div>
              {result.debt.notes && (
                <p className="text-muted-foreground mt-3 text-xs italic">{result.debt.notes}</p>
              )}
            </div>
          )}

          {result && !result.extractionError && (
            <Button asChild variant="outline" size="sm" className="mt-5 w-full">
              <Link
                href={
                  result.shiftId
                    ? `/stations/${stationId}/shifts/${result.shiftId}`
                    : '/review/shifts'
                }
              >
                {vi.upload.viewReview}
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
