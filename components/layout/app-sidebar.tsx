'use client'

import { Building2, ClipboardCheck, FileSpreadsheet, LayoutDashboard, Settings } from 'lucide-react'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { SidebarUser } from '@/components/layout/sidebar-user'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { vi } from '@/messages/vi'

const NAV_ITEMS = [
  { href: '/', label: vi.nav.overview, icon: LayoutDashboard },
  { href: '/stations', label: vi.nav.stations, icon: Building2 },
  { href: '/review/shifts', label: vi.nav.review, icon: ClipboardCheck },
  { href: '/reports/misa-export', label: vi.nav.misaReport, icon: FileSpreadsheet },
  { href: '/settings/stations', label: vi.nav.settings, icon: Settings },
]

type AppSidebarProps = {
  user: { fullName: string; email: string; roleLabel: string }
}

export function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname()

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <span className="text-base font-semibold">{vi.appShortName}</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const isActive =
                  item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
