'use client'

import { useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { vi } from '@/messages/vi'

/**
 * The filter still lives in the URL, so it survives a refresh and can be shared.
 * The submit goes through the router rather than a native GET so `isPending`
 * spans the RSC round-trip — the button spins until the new rows commit.
 */
export function ImportFilterForm({ from, to }: { from?: string; to?: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const params = new URLSearchParams()
    for (const [key, value] of new FormData(e.currentTarget)) {
      // Empty date inputs are dropped so clearing one takes it out of the URL
      // instead of leaving `?from=` behind.
      if (typeof value === 'string' && value) params.set(key, value)
    }
    startTransition(() => router.push(`?${params}`))
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2 text-sm">
      {/* Submitting resets the query string; keep the tab (page resets to 1 on purpose). */}
      <input type="hidden" name="tab" value="nhap-hang" />
      <label className="text-muted-foreground flex items-center gap-1">
        {vi.imports.fromDate}
        <input
          type="date"
          name="from"
          defaultValue={from}
          className="border-input bg-background h-8 rounded-md border px-2"
        />
      </label>
      <label className="text-muted-foreground flex items-center gap-1">
        {vi.imports.toDate}
        <input
          type="date"
          name="to"
          defaultValue={to}
          className="border-input bg-background h-8 rounded-md border px-2"
        />
      </label>
      <Button type="submit" size="sm" variant="outline" loading={isPending}>
        {vi.imports.filter}
      </Button>
    </form>
  )
}
