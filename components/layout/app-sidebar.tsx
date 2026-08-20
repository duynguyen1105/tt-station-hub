'use client'

import {
  Building2,
  ClipboardCheck,
  FileSpreadsheet,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  Users,
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
import { type AppRole } from '@/lib/auth/permissions'
import { vi } from '@/messages/vi'

// `roles`, where present, restricts the item to those roles — an entry a kế
// toán may not open is not shown to them.
const NAV_ITEMS: {
  href: string
  label: string
  icon: LucideIcon
  roles?: AppRole[]
}[] = [
  { href: '/', label: vi.nav.overview, icon: LayoutDashboard },
  { href: '/stations', label: vi.nav.stations, icon: Building2 },
  { href: '/review/shifts', label: vi.nav.review, icon: ClipboardCheck },
  { href: '/reports/misa-export', label: vi.nav.misaReport, icon: FileSpreadsheet },
  { href: '/settings/misa', label: vi.nav.settings, icon: Settings },
  { href: '/admin/accountants', label: vi.nav.admin, icon: Users, roles: ['admin'] },
]

type AppSidebarProps = {
  user: { fullName: string; email: string; role: AppRole; roleLabel: string }
}

export function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname()
  const navItems = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user.role))

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
              {navItems.map((item) => {
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
