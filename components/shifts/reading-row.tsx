'use client'

import { TriangleAlertIcon } from 'lucide-react'
import { toast } from 'sonner'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { useFuelTypeLabel } from '@/components/fuels/catalogue-provider'
import { EditableReading } from '@/components/shared/editable-reading'
import { PhotoView } from '@/components/shared/photo-view'
import { StatusBadge } from '@/components/shared/status-badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { type AppRole } from '@/lib/auth/permissions'
import {
  type ShiftStatus,
  canEditAirPurge,
  canEditClosing,
  canEditOpening,
  canReviewShift,
  isReadingDecided,
} from '@/lib/auth/reading-policy'
import { formatLiters, formatVND } from '@/lib/format'
import { CONFIRM_REQUIRED_ANOMALIES } from '@/lib/matching/anomaly-detection'
import { type ReadingPhoto } from '@/lib/photos/reading-photos'
import { refuseAirPurge } from '@/lib/shifts/air-purge'
import { anomalyLabel, reviewStatusInfo } from '@/lib/ui/status'
import { vi } from '@/messages/vi'

export type ReadingRowData = {
  readingId: string | null
  // The ca and the Trụ address a reading that does not exist yet — a Trụ no
  // photo arrived for is filled in by hand through them.
  shiftId: string
  dispenserId: string
  stationCode?: string | null
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
  // Lít ĐT, Lít Cơ and Tổng tiền, present only where the table carries those columns
  // (Chốt ca of one trạm, which knows the trạm's giá bán lẻ). A row without them
  // renders none of the cells, so header and body stay in step.
  totals?: ReadingTotals
  // Xả gió recorded against this Trụ for this ca, carried beside the totals and
  // shown in the same table that carries them. Null litres is no purge at all,
  // which is not the same answer as a keyed-in 0.
  airPurge?: AirPurge
  // The current user's role and the ca's status drive which edit actions the row
  // offers, per the shared reading policy (docs/adr/0001).
  role: AppRole
  shiftStatus: ShiftStatus
}

export type AirPurge = {
  /** Litres pumped only to push air out of the line, or null where none was. */
  liters: string | null
}

export type ReadingTotals = {
  /** Raw litres on the đồng hồ điện tử, or null when either end is missing. */
  electronicLiters: number | null
  /** Raw litres on the đồng hồ cơ — null on a Trụ that has none, or missing an end. */
  mechanicalLiters: number | null
  /**
   * Litres the two đồng hồ disagree by, or null when they agree / cannot be compared —
   * what marks the Lít Cơ cell and is spelled out under the Trạng thái badge, rather
   * than a column of its own.
   */
  gapDifference: number | null
  /** Litres sold — điện tử less Xả gió — × giá bán lẻ, or null when either is unknown. */
  amount: number | null
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

/**
 * One đồng hồ's own litres for the ca. A meter with no reading at an end — and a Trụ
 * with no đồng hồ cơ at all — has nothing to subtract and reads blank; a Trụ that did
 * not move reads 0, which is an answer rather than a gap in the data.
 *
 * `divergence` — given on the Lít Cơ cell — is the litres the two đồng hồ disagree by,
 * which the reviewer is here to spot: it colours the cell like the anomaly notes, while
 * the amount itself is written under the Trạng thái badge. Null (the two agree, or there
 * is no đồng hồ cơ to compare against) leaves the cell unmarked.
 */
function MeterLiters({
  value,
  divergence = null,
}: {
  value: number | null
  divergence?: number | null
}) {
  if (value === null) return <span className="text-muted-foreground">—</span>
  if (divergence === null) return <>{formatLiters(value)}</>
  return <span className="text-amber-700 dark:text-amber-400">{formatLiters(value)}</span>
}

/**
 * Whether a meter's Cuối reads below its Đầu — a đồng hồ only counts up, so the closing
 * was misread or keyed wrong. False while either end is missing: nothing to compare yet.
 */
function closingBelowOpening(opening: string | null, closing: string | null): boolean {
  if (opening === null || closing === null) return false
  return Number(closing) < Number(opening)
}

/** The warning beside a Cuối that reads below its Đầu, saying so on hover or focus. */
function ClosingBelowOpeningIcon() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <TriangleAlertIcon
          tabIndex={0}
          aria-label={vi.shifts.closingBelowOpening}
          className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
        />
      </TooltipTrigger>
      <TooltipContent>{vi.shifts.closingBelowOpening}</TooltipContent>
    </Tooltip>
  )
}

/** The Xả gió cell: the litres this Trụ bled, blank where it bled none. */
function AirPurgeCell({
  purge,
  canEdit,
  lockHint,
  busy,
  onSave,
}: {
  purge: AirPurge | undefined
  canEdit: boolean
  lockHint?: string
  busy: boolean
  onSave: (value: string) => Promise<boolean>
}) {
  return (
    <span className="font-mono whitespace-nowrap">
      <EditableReading
        value={purge?.liters ?? null}
        canEdit={canEdit}
        lockHint={lockHint}
        busy={busy}
        onSave={onSave}
      />
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
  // Xả gió follows the closing rule but not the duyệt freeze: duyệt settles how the
  // đồng hồ was read, a purge says what happened at the trạm (docs/adr/0002). A Trụ
  // with no reading row has no meter litres to purge from, so there is nothing to
  // record against yet either.
  const mayEditAirPurge = canEditAirPurge(data.role, data.shiftStatus) && canAct
  const mayReview = canReviewShift(data.role, data.shiftStatus)
  // A viewer sees plain read-only values with no lock hints; the lock cue is for
  // a kế toán who edits closings in the same row but is barred from openings.
  const showLocks = data.role !== 'viewer'

  // Duyệt past a confirm-gated anomaly asks first: the same set the endpoint
  // refuses without `confirm`, so the dialog opens exactly when the POST would 400.
  const confirmable = data.anomalyReasons.filter((r) => CONFIRM_REQUIRED_ANOMALIES.includes(r))
  const [confirming, setConfirming] = useState(false)

  async function act(action: 'approve' | 'reject', confirm = false) {
    if (!data.readingId) return
    if (action === 'approve' && confirmable.length > 0 && !confirm) {
      setConfirming(true)
      return
    }
    setActing(action)
    const result = await postAction(
      `/api/readings/${data.readingId}/${action}`,
      confirm ? { confirm: true } : undefined
    )
    if (!result.ok) {
      setActing(null)
      setConfirming(false)
      toast.error(result.error ?? vi.errors.generic)
      return
    }
    // Clearing `acting` inside the transition hands the disabled state over to
    // `pending`, so the buttons grey out once on the click and stay grey until the
    // decided row arrives — instead of blinking back on when the POST returns.
    startTransition(() => {
      router.refresh()
      setActing(null)
      setConfirming(false)
    })
    toast.success(action === 'approve' ? vi.review.approved : vi.review.rejected)
  }

  /**
   * One cell's new value, posted and then read back. Clearing `acting` inside the
   * transition hands the disabled state over to `pending`, so the row greys out once
   * on the click and stays grey until the fresh values commit. An empty box is `null`
   * — the value is gone, not zero and not an empty string.
   */
  async function saveCell(url: string, field: string, value: string, saved: string) {
    setActing('field')
    const result = await postAction(url, { [field]: value || null })
    if (!result.ok) {
      setActing(null)
      toast.error(result.error ?? vi.errors.generic)
      return false
    }
    startTransition(() => {
      router.refresh()
      setActing(null)
    })
    toast.success(saved)
    return true
  }

  /**
   * Xả gió posts to its own endpoint: it is not a meter correction, so it neither
   * preserves an AI original nor re-derives the row's review state.
   *
   * The litres are held to the same rule the route applies, against the Lít ĐT this row
   * is already showing — so a purge the request would refuse is refused here, with the
   * limit named, instead of after a round-trip.
   */
  async function saveAirPurge(value: string) {
    if (!data.readingId) return false
    // Exactly what saveCell is about to post — an empty cell is a null, which clears
    // the purge — held to the rule the route will hold it to.
    const refusal = refuseAirPurge(value || null, data.totals?.electronicLiters ?? null)
    if (refusal) {
      toast.error(refusal)
      return false
    }
    return saveCell(
      `/api/readings/${data.readingId}/air-purge`,
      'airPurgeLiters',
      value,
      vi.shifts.airPurgeSaved
    )
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
    return saveCell(url, field, value, vi.correction.saved)
  }

  return (
    <tr className="border-b align-top">
      {data.stationCode != null && <td className="p-2 align-middle">{data.stationCode}</td>}
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
            <>
              <SlotPhotos
                photos={data.electronicPhotos}
                label={vi.correction.closingElectronicLabel}
                slots={electronicSlots}
              />
              {closingBelowOpening(data.openingElectronicReading, data.electronicReading) && (
                <ClosingBelowOpeningIcon />
              )}
            </>
          }
          onSave={(next) => saveField('correct-closing', 'electronicReading', next)}
        />
      </td>
      {data.totals && (
        <td className="p-2 font-mono whitespace-nowrap">
          <MeterLiters value={data.totals.electronicLiters} />
        </td>
      )}
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
            <>
              <SlotPhotos
                photos={data.mechanicalPhotos}
                label={vi.correction.closingMechanicalLabel}
                slots={mechanicalSlots}
              />
              {closingBelowOpening(data.openingMechanicalReading, data.mechanicalReading) && (
                <ClosingBelowOpeningIcon />
              )}
            </>
          }
          onSave={(next) => saveField('correct-closing', 'mechanicalReading', next)}
        />
      </td>
      {data.totals && (
        <>
          <td className="p-2 font-mono whitespace-nowrap">
            <MeterLiters
              value={data.totals.mechanicalLiters}
              divergence={data.totals.gapDifference}
            />
          </td>
          <td className="p-2">
            <AirPurgeCell
              purge={data.airPurge}
              canEdit={mayEditAirPurge}
              // Only where there is a reading to purge against: a Trụ with no row yet
              // is blank for want of a reading, not because the ca is chốt.
              lockHint={showLocks && canAct ? vi.correction.closingLocked : undefined}
              busy={busy}
              onSave={saveAirPurge}
            />
          </td>
          <td className="p-2 font-mono whitespace-nowrap">
            {data.totals.amount === null ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              formatVND(data.totals.amount)
            )}
          </td>
        </>
      )}
      <td className="space-y-1 p-2">
        {info && <StatusBadge label={info.label} tone={info.tone} />}
        {/* The size of the đồng hồ disagreement, readable without hovering — signed, so
            + says the đồng hồ điện tử counted more. */}
        {data.totals?.gapDifference != null && (
          <div className="font-mono text-xs whitespace-nowrap text-amber-700 dark:text-amber-400">
            {vi.shifts.meterGapHint(
              `${data.totals.gapDifference > 0 ? '+' : ''}${formatLiters(data.totals.gapDifference)}`
            )}
          </div>
        )}
        {/* Chốt ca of one trạm (the table with totals) leaves the reasons out — the gap
            line and the marked cells already say what is off; the review list keeps them. */}
        {!data.totals && data.anomalyReasons.length > 0 && (
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
        {mayReview && confirmable.length > 0 && (
          <AlertDialog open={confirming} onOpenChange={setConfirming}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{vi.review.confirmTitle}</AlertDialogTitle>
                <AlertDialogDescription>
                  {vi.review.confirmBody(confirmable.map(anomalyLabel).join(', '))}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{vi.common.cancel}</AlertDialogCancel>
                <AlertDialogAction
                  loading={acting === 'approve'}
                  onClick={(e) => {
                    // The default Action closes on click, which would unmount the
                    // spinner before the refresh lands.
                    e.preventDefault()
                    act('approve', true)
                  }}
                >
                  {vi.review.confirmApprove}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </td>
    </tr>
  )
}
