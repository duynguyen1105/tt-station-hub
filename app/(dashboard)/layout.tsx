import { FuelCatalogueProvider } from '@/components/fuels/catalogue-provider'
import { AppSidebar } from '@/components/layout/app-sidebar'
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

  return (
    <FuelCatalogueProvider catalogue={catalogue}>
      <SidebarProvider>
        <AppSidebar
          user={{
            fullName: user.fullName,
            email: user.email,
            role: user.role,
            roleLabel: vi.roles[user.role],
          }}
        />
        <SidebarInset>
          <header className="bg-background/80 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b backdrop-blur-sm">
            {/* brass operations rail */}
            <span className="bg-brass h-full w-1 shrink-0" />
            <SidebarTrigger className="-ml-1" />
            <span className="bg-border h-5 w-px" />
            <span className="label-micro hidden sm:inline">Hệ thống quản lý trạm</span>
            <span className="text-brass label-micro mr-4 ml-auto hidden items-center gap-1.5 md:inline-flex">
              <span className="bg-brass size-1.5 animate-pulse rounded-full" />
              Trực tuyến
            </span>
          </header>
          <main className="flex-1 p-4 lg:p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </FuelCatalogueProvider>
  )
}
