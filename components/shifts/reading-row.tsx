'use client'

import { LockIcon } from 'lucide-react'
import { toast } from 'sonner'

import { type ReactNode, useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { useFuelTypeLabel } from '@/components/fuels/catalogue-provider'
import { PhotoView } from '@/components/shared/photo-view'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { type AppRole } from '@/lib/auth/permissions'
import {
  type ShiftStatus,
  canEditClosing,
  canEditOpening,
  canReviewShift,
  isReadingDecided,
} from '@/lib/auth/reading-policy'
import { type ReadingPhoto } from '@/lib/photos/reading-photos'
import { anomalyLabel, reviewStatusInfo } from '@/lib/ui/status'
import { vi } from '@/messages/vi'

export type ReadingRowData = {
  readingId: string | null
  // The ca and the Trụ address a reading that does not exist yet — a Trụ no
  // photo arrived for is filled in by hand through them.
  shiftId: string
  dispenserId: string
  stationName?: string | null
  dispenserName: string
  fuelType: string
  openingElectronicReading: string | null
  electronicReading: string | null
  openingMechanicalReading: string | null
  mechanicalReading: string | null
  electronicConfidence: number | null
  mechanicalConfidence: number | null
  // ALL matched source photos per meter (staff cross-check by shooting the same
  // totalizer twice) — shown next to the readings so the reviewer can compare
  // every original image without digging through Zalo. The chosen photo is first.
  electronicPhotos?: ReadingPhoto[]
  mechanicalPhotos?: ReadingPhoto[]
  reviewStatus: string | null
  anomalyReasons: string[]
  // The current user's role and the ca's status drive which edit actions the row
  // offers, per the shared reading policy (docs/adr/0001).
  role: AppRole
  shiftStatus: ShiftStatus
}

type ActionResult = { ok: boolean; error?: string }

async function postAction(url: string, body?: unknown): Promise<ActionResult> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.ok) return { ok: true }
  const error = await res
    .json()
    .then((data) => (data as { error?: string }).error)
    .catch(() => undefined)
  return { ok: false, error }
}

/**
 * One meter-reading value cell. When `canEdit`, clicking the number turns it into
 * an inline input that saves on Enter/blur and reverts on Escape. When editing is
 * denied but `lockHint` is set (a kế toán on an opening or a chốt-locked closing),
 * a lock icon + tooltip explains why; a viewer just sees the plain value.
 */
function EditableReading({
  value,
  canEdit,
  lockHint,
  onSave,
  busy,
  leading,
  confidence,
}: {
  value: string | null
  canEdit: boolean
  lockHint?: string
  onSave: (next: string) => Promise<boolean>
  busy: boolean
  leading?: ReactNode
  confidence?: number | null
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  // The just-typed value, shown immediately so the user doesn't wait for the
  // server round-trip + router.refresh. Reverted if the save fails, and dropped
  // the moment the fresh `value` prop arrives (adjust-state-during-render).
  const [optimistic, setOptimistic] = useState<string | null>(null)
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    setOptimistic(null)
  }
  const shown = optimistic ?? value

  function begin() {
    setDraft(shown ?? '')
    setEditing(true)
  }

  async function commit() {
    setEditing(false)
    const next = draft
    if (next === (shown ?? '')) return
    setOptimistic(next)
    const ok = await onSave(next)
    if (!ok) setOptimistic(null)
  }

  const confidenceSuffix =
    confidence !== null && confidence !== undefined ? (
      <span className="text-muted-foreground ml-1 text-xs">({confidence}%)</span>
    ) : null

  let body: ReactNode
  if (editing) {
    body = (
      <Input
        className="h-7 w-24"
        value={draft}
        inputMode="decimal"
        autoFocus
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void commit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setEditing(false)
          }
        }}
      />
    )
  } else if (canEdit) {
    body = (
      <button
        type="button"
        onClick={begin}
        disabled={busy}
        className="hover:border-input hover:bg-accent cursor-pointer rounded-md border border-transparent px-1.5 py-0.5 transition-colors"
      >
        {shown ?? '—'}
        {confidenceSuffix}
      </button>
    )
  } else if (lockHint) {
    body = (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-muted-foreground inline-flex items-center gap-1">
            <LockIcon className="size-3" />
            {shown ?? '—'}
            {confidenceSuffix}
          </span>
        </TooltipTrigger>
        <TooltipContent>{lockHint}</TooltipContent>
      </Tooltip>
    )
  } else {
    body = (
      <span>
        {shown ?? '—'}
        {confidenceSuffix}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-2">
      {leading}
      {body}
    </span>
  )
}

/**
 * Every matched photo of one meter slot, side by side. With a cross-check pair
 * the dialog title carries each photo's own AI-read number so the reviewer can
 * compare the two originals directly.
 */
function SlotPhotos({
  photos,
  label,
  slots,
}: {
  photos: ReadingPhoto[] | undefined
  label: string
  slots: number
}) {
  if (!photos || photos.length === 0) return null
  return (
    <span
      className="inline-flex justify-end gap-1"
      // Reserve width for the column's widest slot (thumbnail w-12 = 3rem,
      // gap-1 = 0.25rem) so readings align; single-photo columns reserve nothing.
      style={slots > 1 ? { minWidth: `${slots * 3 + (slots - 1) * 0.25}rem` } : undefined}
    >
      {photos.map((photo, index) => (
        <PhotoView
          key={index}
          url={photo.url}
          label={
            photo.reading !== null ? `${label} — ${vi.correction.aiRead}: ${photo.reading}` : label
          }
        />
      ))}
    </span>
  )
}

export function ReadingRow({
  data,
  electronicSlots,
  mechanicalSlots,
}: {
  data: ReadingRowData
  electronicSlots: number
  mechanicalSlots: number
}) {
  const router = useRouter()
  const fuelLabel = useFuelTypeLabel()
  // Which write is in flight, not merely whether one is — the row shows Duyệt and
  // Từ chối side by side, and only the one that was clicked should spin. 'field'
  // is the inline cell edit, which greys the row without spinning any button.
  const [acting, setActing] = useState<'approve' | 'reject' | 'field' | null>(null)
  // The refresh runs inside a transition, so `pending` spans the RSC round-trip
  // that follows every write — together the two flags keep the row disabled from
  // the click until the fresh values commit, without a gap in between.
  const [pending, startTransition] = useTransition()
  const busy = acting !== null || pending

  const info = data.reviewStatus ? reviewStatusInfo(data.reviewStatus) : null
  // Duyệt / Từ chối need a reading to decide on; the value cells do not — typing
  // into a Trụ that has none creates it.
  const canAct = data.readingId !== null
  const alreadyApproved = data.reviewStatus === 'approved' || data.reviewStatus === 'auto_approved'
  const alreadyRejected = data.reviewStatus === 'rejected'
  // A decided row closes both buttons — the call is made. Only an admin keeps the
  // opposite action live, as the escape hatch for a mistaken duyệt / từ chối.
  const canReverse = data.role === 'admin'
  const approveDisabled = !canAct || busy || alreadyApproved || (alreadyRejected && !canReverse)
  const rejectDisabled = !canAct || busy || alreadyRejected || (alreadyApproved && !canReverse)
  // The call has been made, so the values it was made on are frozen — for the
  // admin too, otherwise a correction would silently un-decide the row (the
  // correction endpoints re-derive reviewStatus). Tự duyệt is the AI's own pass,
  // not a human decision, so it leaves the row editable.
  const decided = isReadingDecided(data.reviewStatus)
  const adminOpening = canEditOpening(data.role) && !decided
  const mayEditClosing = canEditClosing(data.role, data.shiftStatus) && !decided
  const mayReview = canReviewShift(data.role, data.shiftStatus)
  // A viewer sees plain read-only values with no lock hints; the lock cue is for
  // a kế toán who edits closings in the same row but is barred from openings.
  const showLocks = data.role !== 'viewer'

  async function act(action: 'approve' | 'reject') {
    if (!data.readingId) return
    setActing(action)
    const result = await postAction(`/api/readings/${data.readingId}/${action}`)
    if (!result.ok) {
      setActing(null)
      toast.error(result.error ?? vi.errors.generic)
      return
    }
    // Clearing `acting` inside the transition hands the disabled state over to
    // `pending`, so the buttons grey out once on the click and stay grey until the
    // decided row arrives — instead of blinking back on when the POST returns.
    startTransition(() => {
      router.refresh()
      setActing(null)
    })
    toast.success(action === 'approve' ? vi.review.approved : vi.review.rejected)
  }

  async function saveField(
    endpoint: 'correct-opening' | 'correct-closing',
    field: string,
    value: string
  ): Promise<boolean> {
    // A Trụ with no reading yet is addressed by ca + Trụ instead; that endpoint
    // creates the row on the first value saved, then this row has an id like
    // any other and the correction endpoints take over.
    const url = data.readingId
      ? `/api/readings/${data.readingId}/${endpoint}`
      : `/api/shifts/${data.shiftId}/readings/${data.dispenserId}`
    setActing('field')
    const result = await postAction(url, {
      [field]: value || null,
    })
    if (result.ok) {
      startTransition(() => {
        router.refresh()
        setActing(null)
      })
      toast.success(vi.correction.saved)
      return true
    }
    setActing(null)
    toast.error(result.error ?? vi.errors.generic)
    return false
  }

  return (
    <tr className="border-b align-top">
      {data.stationName != null && <td className="p-2 align-middle">{data.stationName}</td>}
      <td className="p-2">
        <div className="font-medium">{data.dispenserName}</div>
        <div className="text-muted-foreground text-xs">{fuelLabel(data.fuelType)}</div>
      </td>
      <td className="p-2 font-mono">
        <EditableReading
          value={data.openingElectronicReading}
          canEdit={adminOpening}
          lockHint={
            showLocks
              ? decided
                ? vi.correction.decisionLocked
                : vi.correction.adminOnly
              : undefined
          }
          busy={busy}
          onSave={(next) => saveField('correct-opening', 'openingElectronicReading', next)}
        />
      </td>
      <td className="p-2 font-mono">
        <EditableReading
          value={data.electronicReading}
          canEdit={mayEditClosing}
          lockHint={
            showLocks
              ? decided
                ? vi.correction.decisionLocked
                : vi.correction.closingLocked
              : undefined
          }
          confidence={data.electronicConfidence}
          busy={busy}
          leading={
            <SlotPhotos
              photos={data.electronicPhotos}
              label={vi.correction.closingElectronicLabel}
              slots={electronicSlots}
            />
          }
          onSave={(next) => saveField('correct-closing', 'electronicReading', next)}
        />
      </td>
      <td className="p-2 font-mono">
        <EditableReading
          value={data.openingMechanicalReading}
          canEdit={adminOpening}
          lockHint={
            showLocks
              ? decided
                ? vi.correction.decisionLocked
                : vi.correction.adminOnly
              : undefined
          }
          busy={busy}
          onSave={(next) => saveField('correct-opening', 'openingMechanicalReading', next)}
        />
      </td>
      <td className="p-2 font-mono">
        <EditableReading
          value={data.mechanicalReading}
          canEdit={mayEditClosing}
          lockHint={
            showLocks
              ? decided
                ? vi.correction.decisionLocked
                : vi.correction.closingLocked
              : undefined
          }
          confidence={data.mechanicalConfidence}
          busy={busy}
          leading={
            <SlotPhotos
              photos={data.mechanicalPhotos}
              label={vi.correction.closingMechanicalLabel}
              slots={mechanicalSlots}
            />
          }
          onSave={(next) => saveField('correct-closing', 'mechanicalReading', next)}
        />
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
          {/* Approve / reject follow canReviewShift: admin at any status,
              accountant until chốt; a viewer never sees them. Once the row is
              decided both close — an admin alone keeps the opposite one live to
              reverse the call. */}
          {mayReview && (
            <Button
              size="sm"
              variant="outline"
              disabled={approveDisabled}
              loading={acting === 'approve'}
              onClick={() => act('approve')}
            >
              {vi.common.approve}
            </Button>
          )}
          {mayReview && (
            <Button
              size="sm"
              variant="ghost"
              disabled={rejectDisabled}
              loading={acting === 'reject'}
              onClick={() => act('reject')}
            >
              {vi.common.reject}
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}
