import { AppSidebar } from '@/components/layout/app-sidebar'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { requireUser } from '@/lib/auth/session'
import { vi } from '@/messages/vi'

// Auth-gated pages read cookies + DB per request, so they must never be
// statically prerendered (regardless of whether env is set at build time).
export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()

  return (
    <SidebarProvider>
      <AppSidebar
        user={{ fullName: user.fullName, email: user.email, roleLabel: vi.roles[user.role] }}
      />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 lg:px-6">
          <SidebarTrigger />
        </header>
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
