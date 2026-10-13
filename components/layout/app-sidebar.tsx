'use client'

import {
  Building2,
  ClipboardCheck,
  FileSpreadsheet,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  Upload,
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
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { type AppRole } from '@/lib/auth/permissions'
import { vi } from '@/messages/vi'

// `roles`, where present, restricts the item to those roles — an entry the user
// may not open (a kế toán on Quản trị, a người xem on Cài đặt) is not shown to them.
const NAV_ITEMS: {
  href: string
  label: string
  icon: LucideIcon
  roles?: AppRole[]
}[] = [
  { href: '/', label: vi.nav.overview, icon: LayoutDashboard },
  { href: '/upload', label: vi.nav.upload, icon: Upload, roles: ['admin', 'accountant'] },
  { href: '/stations', label: vi.nav.stations, icon: Building2 },
  { href: '/review/shifts', label: vi.nav.review, icon: ClipboardCheck },
  { href: '/reports/misa-export', label: vi.nav.misaReport, icon: FileSpreadsheet },
  {
    href: '/settings/misa',
    label: vi.nav.settings,
    icon: Settings,
    roles: ['admin', 'accountant'],
  },
  { href: '/admin/accountants', label: vi.nav.admin, icon: Users, roles: ['admin'] },
]

type AppSidebarProps = {
  user: { fullName: string; email: string; role: AppRole; roleLabel: string }
}

export function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname()
  const navItems = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user.role))

  return (
    // Collapses to an icon strip rather than off-screen: the toggle lives in this
    // header, so it has to stay on screen to bring the sidebar back.
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-sidebar-border border-b p-4 group-data-[collapsible=icon]:px-2">
        {/* h-9 in both states, so collapsing doesn't shift the menu up. */}
        <div className="flex h-9 items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
          <span className="text-sidebar-primary shrink-0 group-data-[collapsible=icon]:hidden">
            <BrandMark className="size-9" />
          </span>
          <div className="min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
            <div className="text-sidebar-foreground text-sm font-bold tracking-tight">
              {vi.appShortName}
            </div>
            <div className="label-micro text-sidebar-foreground/55">Trường Thịnh</div>
          </div>
          <SidebarTrigger className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground shrink-0" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
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
