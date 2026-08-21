'use client'

import { useTransition } from 'react'

import { usePathname, useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { vi } from '@/messages/vi'

/**
 * The khoảng ngày kế toán is closing, over the ca's own ngày bán.
 *
 * The filter lives in the URL, so a filtered view survives a refresh and can be sent
 * to a colleague. The submit goes through the router rather than as a native GET so
 * `isPending` spans the RSC round-trip — the Lọc button stays busy until the new rows
 * commit. Follows the Hàng tồn import filter, which exists for exactly this reason.
 */
export function ReportFilterForm({ from, to }: { from?: string; to?: string }) {
  const pathname = usePathname()
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
    // No page: a narrower filter makes page 3 meaningless, so applying one
    // starts again at the top of what it matched.
    const qs = params.toString()
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname))
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2 text-sm">
      <label className="text-muted-foreground flex items-center gap-1">
        {vi.common.fromDate}
        <Input type="date" name="from" defaultValue={from} className="h-8 w-auto" />
      </label>
      <label className="text-muted-foreground flex items-center gap-1">
        {vi.common.toDate}
        <Input type="date" name="to" defaultValue={to} className="h-8 w-auto" />
      </label>
      <Button type="submit" size="sm" variant="outline" loading={isPending}>
        {vi.common.filter}
      </Button>
    </form>
  )
}
