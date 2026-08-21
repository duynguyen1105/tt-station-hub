'use client'

import { LockIcon } from 'lucide-react'

import { type ReactNode, useState } from 'react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export type EditableOption = { value: string; label: string }

/**
 * One AI-read choice cell — the twin of `EditableReading` for a value that is
 * picked rather than typed. Same three audiences: `canEdit` turns the label into
 * an ô chọn on click, `lockHint` explains with a lock icon why it stopped moving,
 * and a viewer just sees the label.
 *
 * The ô chọn opens on the click that opened it, rather than waiting for a second
 * one on a trigger the user did not ask for.
 */
export function EditableSelect({
  value,
  fallbackLabel,
  options,
  canEdit,
  lockHint,
  onSave,
  busy,
}: {
  value: string | null
  /** Shown when `value` is not among `options` — a khóa the trạm no longer sells
   *  would otherwise render as an empty cell. */
  fallbackLabel?: string
  options: EditableOption[]
  canEdit: boolean
  lockHint?: string
  onSave: (next: string) => Promise<boolean>
  busy: boolean
}) {
  const [editing, setEditing] = useState(false)
  // The just-picked value, shown immediately so the user doesn't wait for the
  // server round-trip + router.refresh. Reverted if the save fails, and dropped
  // the moment the fresh `value` prop arrives (adjust-state-during-render).
  const [optimistic, setOptimistic] = useState<string | null>(null)
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    setOptimistic(null)
  }
  const shown = optimistic ?? value
  const label = options.find((option) => option.value === shown)?.label ?? fallbackLabel ?? '—'

  async function commit(next: string) {
    setEditing(false)
    if (next === shown) return
    setOptimistic(next)
    const ok = await onSave(next)
    if (!ok) setOptimistic(null)
  }

  if (editing) {
    return (
      <Select
        defaultOpen
        value={shown ?? undefined}
        disabled={busy}
        onValueChange={commit}
        // Dismissing the menu without choosing is a cancel, not an empty save.
        onOpenChange={(open) => {
          if (!open) setEditing(false)
        }}
      >
        <SelectTrigger className="h-7 w-auto min-w-24 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  let body: ReactNode
  if (canEdit) {
    body = (
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={busy}
        className="hover:border-input hover:bg-accent cursor-pointer rounded-md border border-transparent px-1.5 py-0.5 transition-colors"
      >
        {label}
      </button>
    )
  } else if (lockHint) {
    body = (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-muted-foreground inline-flex items-center gap-1">
            <LockIcon className="size-3" />
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent>{lockHint}</TooltipContent>
      </Tooltip>
    )
  } else {
    body = <span>{label}</span>
  }

  return <span className="inline-flex items-center">{body}</span>
}
