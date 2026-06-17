'use client'

import { toast } from 'sonner'

import { useState } from 'react'

import { useRouter } from 'next/navigation'

import { StatusBadge } from '@/components/shared/status-badge'
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
import { anomalyLabel, fuelTypeLabel, reviewStatusInfo } from '@/lib/ui/status'
import { vi } from '@/messages/vi'

export type ReadingRowData = {
  readingId: string | null
  dispenserName: string
  fuelType: string
  electronicReading: string | null
  mechanicalReading: string | null
  electronicConfidence: number | null
  mechanicalConfidence: number | null
  reviewStatus: string | null
  anomalyReasons: string[]
}

async function postAction(url: string, body?: unknown): Promise<boolean> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.ok
}

export function ReadingRow({ data }: { data: ReadingRowData }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [electronic, setElectronic] = useState(data.electronicReading ?? '')
  const [mechanical, setMechanical] = useState(data.mechanicalReading ?? '')

  const info = data.reviewStatus ? reviewStatusInfo(data.reviewStatus) : null
  const canAct = data.readingId !== null

  async function act(action: 'approve' | 'reject') {
    if (!data.readingId) return
    setBusy(true)
    const ok = await postAction(`/api/readings/${data.readingId}/${action}`)
    setBusy(false)
    if (ok) router.refresh()
    else toast.error(vi.errors.generic)
  }

  async function saveCorrection() {
    if (!data.readingId) return
    setBusy(true)
    const ok = await postAction(`/api/readings/${data.readingId}/correct`, {
      electronicReading: electronic || null,
      mechanicalReading: mechanical || null,
    })
    setBusy(false)
    if (ok) {
      setOpen(false)
      router.refresh()
    } else {
      toast.error(vi.errors.generic)
    }
  }

  return (
    <tr className="border-b align-top">
      <td className="p-2">
        <div className="font-medium">{data.dispenserName}</div>
        <div className="text-muted-foreground text-xs">{fuelTypeLabel(data.fuelType)}</div>
      </td>
      <td className="p-2 font-mono">
        {data.electronicReading ?? '—'}
        {data.electronicConfidence !== null && (
          <span className="text-muted-foreground ml-1 text-xs">({data.electronicConfidence}%)</span>
        )}
      </td>
      <td className="p-2 font-mono">
        {data.mechanicalReading ?? '—'}
        {data.mechanicalConfidence !== null && (
          <span className="text-muted-foreground ml-1 text-xs">({data.mechanicalConfidence}%)</span>
        )}
      </td>
      <td className="space-y-1 p-2">
        {info && <StatusBadge label={info.label} tone={info.tone} />}
        {data.anomalyReasons.length > 0 && (
          <div className="text-xs text-amber-700 dark:text-amber-400">
            {data.anomalyReasons.map(anomalyLabel).join(', ')}
          </div>
        )}
      </td>
      <td className="p-2 text-right whitespace-nowrap">
        <div className="inline-flex gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={!canAct || busy}
            onClick={() => act('approve')}
          >
            {vi.common.approve}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" disabled={!canAct || busy}>
                {vi.common.correct}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {vi.correction.title} — {data.dispenserName}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <Field>
                  <FieldLabel htmlFor="electronic">{vi.correction.electronicLabel}</FieldLabel>
                  <Input
                    id="electronic"
                    value={electronic}
                    inputMode="decimal"
                    onChange={(e) => setElectronic(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="mechanical">{vi.correction.mechanicalLabel}</FieldLabel>
                  <Input
                    id="mechanical"
                    value={mechanical}
                    inputMode="decimal"
                    onChange={(e) => setMechanical(e.target.value)}
                  />
                </Field>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  {vi.common.cancel}
                </Button>
                <Button onClick={saveCorrection} disabled={busy}>
                  {vi.common.save}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            size="sm"
            variant="ghost"
            disabled={!canAct || busy}
            onClick={() => act('reject')}
          >
            {vi.common.reject}
          </Button>
        </div>
      </td>
    </tr>
  )
}
