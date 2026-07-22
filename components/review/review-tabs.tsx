'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'
import { vi } from '@/messages/vi'

/**
 * Tabs for the review area: shift readings vs debt visits are two separate
 * queues, and the sidebar links only to the first — without these tabs the debt
 * queue was unreachable from the UI.
 */
export function ReviewTabs() {
  const pathname = usePathname()

  const tabs = [
    { href: '/review/shifts', label: vi.shifts.title },
    { href: '/review/debts', label: vi.debts.title },
  ]

  return (
    <nav className="flex gap-1 border-b">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            pathname.startsWith(tab.href)
              ? 'border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground border-transparent'
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
