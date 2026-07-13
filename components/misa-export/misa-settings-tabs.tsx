'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'
import { vi } from '@/messages/vi'

export function MisaSettingsTabs() {
  const pathname = usePathname()

  const tabs = [
    { href: '/settings/misa/prices', label: vi.misaSettings.prices },
    { href: '/settings/misa/config', label: vi.misaSettings.config },
    { href: '/settings/misa/fuel-map', label: vi.misaSettings.fuelMap },
  ]

  return (
    <nav className="flex gap-1 border-b">
      {tabs.map((tab) => {
        const isActive = pathname.startsWith(tab.href)
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
