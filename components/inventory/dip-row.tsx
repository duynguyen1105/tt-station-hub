'use client'

import { useState } from 'react'

import { EditableReading } from '@/components/shared/editable-reading'
import { type EditableOption, EditableSelect } from '@/components/shared/editable-select'
import { PhotoView } from '@/components/shared/photo-view'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { useSaveAction } from '@/hooks/use-save-action'
import { type AppRole } from '@/lib/auth/permissions'
import { canCorrectTankDip, canReviewTankDip } from '@/lib/inventory/dip-review'
import { reviewStatusInfo } from '@/lib/ui/status'
import { vi } from '@/messages/vi'

export type DipRowData = {
  id: string
  /** Pre-formatted on the server, so the row renders the same time the rest of the page does. */
  measuredAt: string
  tankCode: string
  tankLabel: string
  /** What Cấu hình says the hầm holds, else what the dip carries — see `dipFuel`. */
  fuelLabel: string
  dipValue: string
  /** Barem litres, already formatted; null when the sheet could not answer. */
  liters: string | null
  /** Why the barem refused, when it did — shown in place of the litres. */
  litersRefusal: string | null
  delta: string | null
  photoUrl: string | null
  /** The AI's confidence in this dip read, off the ShiftPhoto it came from. */
  confidence: number | null
  /** Who uploaded the photo, and the message typed with the upload. */
  sender: string | null
  senderNote: string | null
  /** What the AI read, once a người duyệt has retyped it; null until then. */
  originalDipValue: string | null
  reviewStatus: string
  role: AppRole
}

/**
 * One row of Lịch sử đo bồn, with the dip photo inline and Duyệt / Từ chối beside
 * it — the same shape as a ca's chỉ số row (components/shifts/reading-row.tsx), so
 * a người duyệt checks an AI-read số đo the same way wherever they meet one.
 */
export function DipRow({
  data,
  tankOptions,
}: {
  data: DipRowData
  // Beside `data` rather than inside it: the page hands every row the same array,
  // so the RSC payload carries the list once and points the rows at it.
  tankOptions: EditableOption[]
}) {
  // Which write is in flight, not merely whether one is — the row shows Duyệt and
  // Từ chối side by side, and only the one that was clicked should spin.
  const [acting, setActing] = useState<'approve' | 'reject' | null>(null)
  // `busy` spans the POST *and* the RSC refresh that follows it, so the buttons
  // grey out on the click and stay grey until the decided row arrives.
  const { busy, save } = useSaveAction()

  const info = reviewStatusInfo(data.reviewStatus)
  const alreadyApproved = data.reviewStatus === 'approved'
  const alreadyRejected = data.reviewStatus === 'rejected'
  // A decided row closes both buttons — the call is made. Only an admin keeps the
  // opposite action live, as the escape hatch for a mistaken duyệt / từ chối.
  const canReverse = data.role === 'admin'
  const disabled = busy || acting !== null
  const approveDisabled = disabled || alreadyApproved || (alreadyRejected && !canReverse)
  const rejectDisabled = disabled || alreadyRejected || (alreadyApproved && !canReverse)
  const mayReview = canReviewTankDip(data.role)
  // Only while nobody has decided: the hầm and the số đo are the
  // facts the duyệt was made on. The lock says so in the same words a chốt-ca row
  // uses, because it is the same rule.
  const mayCorrect = canCorrectTankDip(data.role, data.reviewStatus)
  const lockHint = mayReview ? vi.correction.decisionLocked : undefined

  function act(action: 'approve' | 'reject') {
    setActing(action)
    save(
      `/api/inventory/dips/${data.id}/${action}`,
      {
        success: action === 'approve' ? vi.inventory.dipApproved : vi.inventory.dipRejected,
      },
      { onSuccess: () => setActing(null), onError: () => setActing(null) }
    )
  }

  // EditableReading / EditableSelect ask whether the save landed so they can roll
  // their optimistic value back; useSaveAction reports that through handlers, not
  // a return value.
  function correct(body: object, success: string): Promise<boolean> {
    return new Promise((resolve) => {
      save(
        `/api/inventory/dips/${data.id}/correct`,
        { body, success },
        { onSuccess: () => resolve(true), onError: () => resolve(false) }
      )
    })
  }

  return (
    <tr className="border-b">
      <td className="p-2">
        {data.measuredAt}
        {data.sender && <div className="text-muted-foreground text-xs">{data.sender}</div>}
        {data.senderNote && (
          <div className="max-w-48 text-xs whitespace-normal">💬 {data.senderNote}</div>
        )}
      </td>
      <td className="p-2 font-medium">
        {/* The hầm is read off the same plate as the số đo and misread the same
            way, so it is repaired in place beside it. */}
        <EditableSelect
          value={data.tankCode}
          fallbackLabel={data.tankLabel}
          options={tankOptions}
          canEdit={mayCorrect}
          lockHint={lockHint}
          busy={disabled}
          onSave={(next) => correct({ tankCode: next }, vi.inventory.tankCorrected)}
        />
      </td>
      {/* Not editable: a hầm's nhiên liệu is set once, in Cấu hình, and every dip of
          that hầm shows it — moving the dip to another hầm is how it changes. */}
      <td className="p-2">{data.fuelLabel}</td>
      <td className="p-2 text-right font-mono">
        {/* The photo sits with the number it was read from, so checking the AI
            against the dip-stick — and repairing it — never means leaving the
            table. Once decided, a lock icon says why the number stopped moving;
            a viewer sees neither the lock nor the edit, just the value. */}
        <EditableReading
          value={data.dipValue}
          canEdit={mayCorrect}
          lockHint={lockHint}
          // An AI confidence beside a hand-typed number is a lie, so it drops
          // away the moment someone retypes the read.
          confidence={data.originalDipValue === null ? data.confidence : null}
          busy={disabled}
          leading={
            <PhotoView
              url={data.photoUrl}
              label={`${vi.inventory.dipValue} — ${vi.correction.aiRead}: ${data.originalDipValue ?? data.dipValue}`}
            />
          }
          onSave={(next) => correct({ dipValue: next }, vi.inventory.dipCorrected)}
        />
      </td>
      <td className="p-2 text-right font-mono">
        {data.liters ?? (
          <span className="text-muted-foreground text-xs">{data.litersRefusal ?? '—'}</span>
        )}
      </td>
      <td className="p-2 text-right font-mono">{data.delta ?? '—'}</td>
      <td className="p-2">
        <StatusBadge label={info.label} tone={info.tone} />
      </td>
      <td className="p-2 text-right whitespace-nowrap">
        {/* A viewer never sees them. Unlike a ca's chỉ số there is no chốt that
            closes the decision — a đo hầm belongs to no ca. */}
        {mayReview && (
          <div className="inline-flex gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={approveDisabled}
              loading={acting === 'approve'}
              onClick={() => act('approve')}
            >
              {vi.common.approve}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={rejectDisabled}
              loading={acting === 'reject'}
              onClick={() => act('reject')}
            >
              {vi.common.reject}
            </Button>
          </div>
        )}
      </td>
    </tr>
  )
}
