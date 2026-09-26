'use client'

/* eslint-disable @next/next/no-img-element -- local object URLs of photos not yet uploaded; next/image adds no value here */
import { X } from 'lucide-react'
import { toast } from 'sonner'

import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { vi } from '@/messages/vi'

type Kind = 'shift' | 'debt' | 'dip'
type Item = { id: string; url: string; failed?: string }

const KINDS: Kind[] = ['shift', 'debt', 'dip']
const MAX_ITEMS = 50
const CONCURRENCY = 3
// Every photo is re-encoded here so each request stays well under Vercel's 4.5 MB
// body cap; the AI only ever sees ≤ 1568 px, so nothing it can read is lost.
const MAX_EDGE = 2048
const QUALITY = 0.85
const RETRY_QUALITY = 0.7
const SIZE_CAP = 2_000_000

export function UploadBoard({
  stations,
  today,
}: {
  stations: { id: string; code: string; name: string }[]
  today: string
}) {
  const [stationId, setStationId] = useState(stations.length === 1 ? (stations[0]?.id ?? '') : '')
  const [day, setDay] = useState(today)

  if (!stations.length) {
    return <p className="text-muted-foreground text-sm">{vi.upload.noStations}</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <Field className="w-64">
          <FieldLabel>{vi.upload.station}</FieldLabel>
          <Select value={stationId} onValueChange={setStationId}>
            <SelectTrigger>
              <SelectValue placeholder={vi.upload.selectStation} />
            </SelectTrigger>
            <SelectContent>
              {stations.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field className="w-44">
          <FieldLabel htmlFor="upload-day">{vi.upload.day}</FieldLabel>
          <Input
            id="upload-day"
            type="date"
            max={today}
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </Field>
      </div>
      {KINDS.map((kind) => (
        <UploadSection key={kind} kind={kind} stationId={stationId} day={day} />
      ))}
    </div>
  )
}

/** Decodes a picked photo and re-encodes it as a JPEG no larger than the request can carry. */
async function toJpeg(url: string): Promise<Blob> {
  // The <img> path applies EXIF orientation, and decodes HEIC on Safari.
  const img = new Image()
  img.src = url
  try {
    await img.decode()
  } catch {
    throw new Error(vi.upload.unreadable)
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
  const encode = (quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  let blob = await encode(QUALITY)
  if (blob && blob.size > SIZE_CAP) blob = await encode(RETRY_QUALITY)
  if (!blob) throw new Error(vi.upload.unreadable)
  // Two of these make a công nợ pair, so this cap is what keeps a request under 4.5 MB.
  if (blob.size > SIZE_CAP) throw new Error(vi.upload.tooLarge)
  return blob
}

function UploadSection({ kind, stationId, day }: { kind: Kind; stationId: string; day: string }) {
  const text = vi.upload.sections[kind]
  const [items, setItems] = useState<Item[]>([])
  const [note, setNote] = useState('')
  const [picked, setPicked] = useState<number | null>(null)
  const [singles, setSingles] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const urls = useRef(new Set<string>())

  useEffect(() => {
    const live = urls.current
    return () => live.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  const busy = progress !== null
  const pairs = kind === 'debt' && !singles
  const odd = pairs && items.length % 2 === 1
  const unitCount = pairs ? Math.floor(items.length / 2) : items.length

  function revoke(url: string) {
    URL.revokeObjectURL(url)
    urls.current.delete(url)
  }

  function add(files: FileList | null) {
    const images = [...(files ?? [])].filter((f) => f.type.startsWith('image/'))
    const room = MAX_ITEMS - items.length
    if (images.length > room) toast.error(vi.upload.tooMany(MAX_ITEMS))
    const added = images.slice(0, Math.max(0, room)).map((file) => {
      const url = URL.createObjectURL(file)
      urls.current.add(url)
      return { id: crypto.randomUUID(), url }
    })
    if (added.length) setItems((current) => [...current, ...added])
  }

  function remove(item: Item) {
    revoke(item.url)
    setItems((current) => current.filter((other) => other.id !== item.id))
    setPicked(null)
  }

  // Tap one photo, then another, to swap them — how a wrongly paired lượt is fixed.
  function tap(index: number) {
    if (picked === null) return setPicked(index)
    if (picked !== index) {
      setItems((current) =>
        current.map((item, i) =>
          i === picked ? (current[index] ?? item) : i === index ? (current[picked] ?? item) : item
        )
      )
    }
    setPicked(null)
  }

  async function post(unit: Item[]) {
    const form = new FormData()
    form.set('kind', kind)
    form.set('stationId', stationId)
    form.set('day', day)
    if (note.trim()) form.set('note', note.trim())
    for (const item of unit) form.append('photos', await toJpeg(item.url), 'photo.jpg')
    const res = await fetch('/api/uploads', { method: 'POST', body: form })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      throw new Error(body?.error ?? vi.errors.generic)
    }
  }

  async function send() {
    const units = pairs
      ? Array.from({ length: unitCount }, (_, i) => items.slice(2 * i, 2 * i + 2))
      : items.map((item) => [item])
    const failed = new Map<string, string>()
    let next = 0
    let done = 0
    setPicked(null)
    setProgress({ done, total: units.length })
    const worker = async () => {
      for (let unit = units[next++]; unit; unit = units[next++]) {
        try {
          await post(unit)
        } catch (error) {
          const message = error instanceof Error ? error.message : vi.errors.generic
          for (const item of unit) failed.set(item.id, message)
        }
        setProgress({ done: ++done, total: units.length })
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))

    const sent = units.flat().filter((item) => !failed.has(item.id))
    const sentIds = new Set(sent.map((item) => item.id))
    sent.forEach((item) => revoke(item.url))
    setItems((current) =>
      current
        .filter((item) => !sentIds.has(item.id))
        .map((item) => ({ ...item, failed: failed.get(item.id) }))
    )
    setProgress(null)
    if (failed.size) {
      toast.error(vi.upload.someFailed(failed.size), {
        description: [...new Set(failed.values())].join(' '),
      })
    } else {
      setNote('')
      toast.success(vi.upload.sent(sent.length))
    }
  }

  const thumb = (item: Item, index: number) => (
    <div
      key={item.id}
      title={item.failed}
      className={cn(
        'relative aspect-square overflow-hidden rounded-md border',
        item.failed && 'ring-destructive ring-2',
        picked === index && 'ring-primary ring-2'
      )}
    >
      <button
        type="button"
        className="block size-full"
        disabled={!pairs || busy}
        onClick={() => tap(index)}
      >
        <img src={item.url} alt="" className="size-full object-cover" />
      </button>
      <span className="absolute top-1 left-1 rounded bg-black/60 px-1.5 text-xs text-white">
        {index + 1}
      </span>
      <button
        type="button"
        aria-label={vi.upload.remove}
        disabled={busy}
        onClick={() => remove(item)}
        className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )

  return (
    <section aria-label={text.title}>
      <Card>
        <CardHeader>
          <CardTitle>{text.title}</CardTitle>
          <CardDescription>{text.hint}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              if (!busy) add(e.dataTransfer.files)
            }}
            className={cn(
              'text-muted-foreground flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed p-6 text-center text-sm',
              dragOver && 'border-primary bg-primary/5'
            )}
          >
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={busy}
              className="sr-only"
              onChange={(e) => {
                add(e.target.files)
                e.target.value = ''
              }}
            />
            {vi.upload.dropHint}
          </label>

          {kind === 'debt' && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={singles}
                disabled={busy}
                onCheckedChange={(checked) => {
                  setSingles(checked === true)
                  setPicked(null)
                }}
              />
              <span>{vi.upload.singles}</span>
            </label>
          )}

          {items.length > 0 &&
            (pairs ? (
              <div className="space-y-2">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: Math.ceil(items.length / 2) }, (_, p) => (
                    <div key={p} className="space-y-2 rounded-lg border p-2">
                      <div className="label-micro">{vi.upload.visit(p + 1)}</div>
                      <div className="grid grid-cols-2 gap-2">
                        {items.slice(2 * p, 2 * p + 2).map((item, k) => thumb(item, 2 * p + k))}
                        {2 * p + 1 === items.length && (
                          <div className="text-muted-foreground flex aspect-square items-center justify-center rounded-md border border-dashed p-2 text-center text-xs">
                            {vi.upload.missingHalf}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {odd ? (
                  <p className="text-destructive text-sm">{vi.upload.oddPair}</p>
                ) : (
                  <p className="text-muted-foreground text-xs">{vi.upload.swapHint}</p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {items.map(thumb)}
              </div>
            ))}

          <Field>
            <FieldLabel htmlFor={`upload-note-${kind}`}>{vi.upload.noteLabel}</FieldLabel>
            <Textarea
              id={`upload-note-${kind}`}
              maxLength={500}
              value={note}
              placeholder={vi.upload.notePlaceholder}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>

          <div className="space-y-1">
            <Button
              type="button"
              loading={busy}
              disabled={!stationId || !day || unitCount === 0 || odd || busy}
              onClick={send}
            >
              {progress
                ? vi.upload.sending(progress.done, progress.total)
                : kind === 'debt'
                  ? vi.upload.sendVisits(unitCount)
                  : vi.upload.sendPhotos(items.length)}
            </Button>
            {!stationId && <p className="text-muted-foreground text-xs">{vi.upload.pickStation}</p>}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
