'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'
import { vi } from '@/messages/vi'

export function StationTabs({ stationId }: { stationId: string }) {
  const pathname = usePathname()
  const base = `/stations/${stationId}`

  const tabs = [
    { href: base, label: vi.stationTabs.overview },
    { href: `${base}/shifts`, label: vi.stationTabs.shifts },
    { href: `${base}/documents`, label: vi.stationTabs.documents },
    { href: `${base}/inventory`, label: vi.stationTabs.inventory },
    { href: `${base}/debts`, label: vi.stationTabs.debts },
    { href: `${base}/misa`, label: vi.stationTabs.misa },
  ]

  return (
    <nav className="flex gap-1 border-b">
      {tabs.map((tab) => {
        const isActive = tab.href === base ? pathname === base : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground border-transparent'
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
