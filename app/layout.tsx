import type { Metadata } from 'next'
import { Be_Vietnam_Pro, Geist_Mono } from 'next/font/google'

import { ClientToaster } from '@/components/layout/client-toaster'
import { ThemeProvider } from '@/components/layout/theme-provider'
import { QueryProvider } from '@/lib/query-provider'
import { vi } from '@/messages/vi'

import './globals.css'

// Primary UI font. Includes the `vietnamese` subset so Vietnamese glyphs render
// correctly. Exposed as `--font-sans`, which globals.css applies to <html>.
const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
})

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
    <html
      lang="vi"
      suppressHydrationWarning
      className={`${beVietnamPro.variable} ${geistMono.variable}`}
    >
      <body className="min-h-dvh antialiased">
        <QueryProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange
          >
            {children}
            <ClientToaster />
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
