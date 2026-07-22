'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

/* eslint-disable @next/next/no-img-element -- signed Supabase URLs expire; next/image adds no value here */

/**
 * Compact photo thumbnail that opens the full image in a dialog — lets a reviewer
 * check the original meter photo against the AI-read number without leaving the
 * table. Renders nothing when there is no photo.
 */
export function PhotoView({ url, label }: { url: string | null; label: string }) {
  if (!url) return null
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          title={label}
          className="focus-visible:ring-ring hover:ring-brass/60 inline-block h-9 w-12 shrink-0 overflow-hidden rounded border align-middle hover:ring-2 focus-visible:ring-2 focus-visible:outline-none"
        >
          <img src={url} alt={label} className="size-full object-cover" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <img src={url} alt={label} className="max-h-[75vh] w-full rounded-lg object-contain" />
      </DialogContent>
    </Dialog>
  )
}
