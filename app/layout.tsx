import type { Metadata } from 'next'

import { ClientToaster } from '@/components/layout/client-toaster'
import { ScrollActivity } from '@/components/layout/scroll-activity'
import { ThemeProvider } from '@/components/layout/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { QueryProvider } from '@/lib/query-provider'
import { vi } from '@/messages/vi'

import './globals.css'

export const metadata: Metadata = {
  title: vi.appName,
  description: vi.appDescription,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <QueryProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange
          >
            <TooltipProvider delayDuration={0}>
              {children}
              <ClientToaster />
              <ScrollActivity />
            </TooltipProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
