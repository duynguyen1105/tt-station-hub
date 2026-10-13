import { cookies } from 'next/headers'

import { FuelCatalogueProvider } from '@/components/fuels/catalogue-provider'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { RefreshOnReturn } from '@/components/layout/refresh-on-return'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { requireUser } from '@/lib/auth/session'
import { loadFuelCatalogue } from '@/lib/fuels/load-catalogue'
import { vi } from '@/messages/vi'

// Auth-gated pages read cookies + DB per request, so they must never be
// statically prerendered (regardless of whether env is set at build time).
export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  // The danh mục nhiên liệu is read here, once, rather than by each page that renders
  // a tên: every screen under this layout speaks about nhiên liệu, and the client
  // components among them cannot query for it themselves. Read after the auth gate, so
  // a request without a session redirects without touching the danh mục.
  const catalogue = await loadFuelCatalogue()
  // The sidebar writes its expanded/collapsed state to this cookie; reading it here
  // renders the next page in that state rather than expanding and snapping shut.
  const sidebarOpen = (await cookies()).get('sidebar_state')?.value !== 'false'

  return (
    <FuelCatalogueProvider catalogue={catalogue}>
      <RefreshOnReturn />
      <SidebarProvider defaultOpen={sidebarOpen}>
        <AppSidebar
          user={{
            fullName: user.fullName,
            email: user.email,
            role: user.role,
            roleLabel: vi.roles[user.role],
          }}
        />
        <SidebarInset className="min-w-0">
          {/* Phones only: the sidebar is a sheet there, and this is the way to open it.
              On desktop the toggle lives in the sidebar itself. */}
          <header className="bg-background/80 sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b px-2 backdrop-blur-sm md:hidden print:hidden">
            <SidebarTrigger />
            <span className="text-sm font-semibold">{vi.appShortName}</span>
          </header>
          <div className="flex-1 p-4 lg:p-6">
            {/* 1600px: measured on the LAMDONG01 closing sheet at 2560px — wider only spreads
                columns apart; narrower starts wrapping headers and fuel names. */}
            <div className="mx-auto w-full max-w-[100rem]">{children}</div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </FuelCatalogueProvider>
  )
}
