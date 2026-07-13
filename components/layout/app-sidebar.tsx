'use client'

import {
  Building2,
  ClipboardCheck,
  FileSpreadsheet,
  LayoutDashboard,
  Settings,
  Upload,
} from 'lucide-react'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { BrandMark } from '@/components/layout/brand-mark'
import { SidebarUser } from '@/components/layout/sidebar-user'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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
  { href: '/upload', label: vi.nav.upload, icon: Upload },
  { href: '/reports/misa-export', label: vi.nav.misaReport, icon: FileSpreadsheet },
  { href: '/settings/misa', label: vi.nav.settings, icon: Settings },
]

type AppSidebarProps = {
  user: { fullName: string; email: string; roleLabel: string }
}

export function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname()

  return (
    <Sidebar>
      <SidebarHeader className="border-sidebar-border border-b p-4">
        <div className="flex items-center gap-2.5">
          <span className="text-sidebar-primary shrink-0">
            <BrandMark className="size-9" />
          </span>
          <div className="leading-tight">
            <div className="text-sidebar-foreground text-sm font-bold tracking-tight">
              {vi.appShortName}
            </div>
            <div className="label-micro text-sidebar-foreground/55">Trường Thịnh</div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="label-micro text-sidebar-foreground/45">
            Điều hướng
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const isActive =
                  item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.label}
                      className="data-[active=true]:shadow-[inset_2px_0_0_var(--sidebar-primary)]"
                    >
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
      <SidebarFooter className="border-sidebar-border border-t">
        <SidebarUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
