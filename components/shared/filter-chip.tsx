'use client'

import { XIcon } from 'lucide-react'

/**
 * One criterion a bộ lọc is narrowing by, and the one click that drops it.
 *
 * A bộ lọc folded behind an icon can hide what it is doing, so what is applied reads
 * beside the icon instead. Each chip drops only its own criterion and leaves the rest
 * of the filter standing — that is what makes it worth a chip each rather than one
 * summary line.
 */
export function FilterChip({
  label,
  removeLabel,
  onRemove,
}: {
  label: string
  removeLabel: string
  onRemove: () => void
}) {
  return (
    <span className="bg-muted flex h-8 items-center gap-1 rounded-md py-1 pr-1 pl-2.5 text-sm">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="text-muted-foreground hover:text-foreground hover:bg-background focus-visible:ring-ring/50 rounded-sm p-0.5 focus-visible:ring-[3px] focus-visible:outline-none"
      >
        <XIcon className="size-3.5" />
      </button>
    </span>
  )
}
