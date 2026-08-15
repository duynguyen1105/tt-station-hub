'use client'

import type { ComponentProps } from 'react'

import Link, { useLinkStatus } from 'next/link'

/**
 * The pending signal for a navigation that changes only searchParams (sub-tabs,
 * pagers, filters): no segment remounts, so loading.tsx never shows and the old
 * screen would just freeze. useLinkStatus flags the clicked link itself.
 */
function PendingSpinner() {
  const { pending } = useLinkStatus()
  if (!pending) return null
  return (
    <span
      aria-label="Đang tải"
      className="ml-1.5 inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent align-middle opacity-60"
    />
  )
}

/**
 * Drop-in next/link that shows a small spinner inside itself while its
 * navigation is in flight — the user's click always gets an immediate signal,
 * whether the target is a new segment or the same page with new params.
 */
export function NavLink({ children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link {...props}>
      {children}
      <PendingSpinner />
    </Link>
  )
}
