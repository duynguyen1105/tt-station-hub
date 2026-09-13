'use client'

import { LockIcon } from 'lucide-react'

import { type ReactNode, useState } from 'react'

import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * One AI-read number cell. When `canEdit`, clicking the number turns it into an
 * inline input that saves on Enter/blur and reverts on Escape. When editing is
 * denied but `lockHint` is set (a kế toán on an opening, a chốt-locked closing, a
 * đo hầm someone has already decided), a lock icon + tooltip explains why; a
 * viewer just sees the plain value.
 *
 * Shared by a ca's chỉ số row and a đo hầm's số đo, so a người duyệt corrects an
 * AI-read number the same way wherever they meet one.
 */
export function EditableReading({
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
