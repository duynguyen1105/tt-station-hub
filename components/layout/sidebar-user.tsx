'use client'

import { LoaderCircle, LogOut } from 'lucide-react'

import { useState } from 'react'

import { useRouter } from 'next/navigation'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { createClient } from '@/lib/supabase/client'
import { vi } from '@/messages/vi'

type SidebarUserProps = {
  user: { fullName: string; email: string; roleLabel: string }
}

export function SidebarUser({ user }: SidebarUserProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function handleLogout() {
    // Never cleared: the page navigates away, and leaving it set keeps the
    // spinner up instead of flicking back to the icon mid-redirect.
    setBusy(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Avatar className="size-8">
            <AvatarFallback>{user.fullName.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium">{user.fullName}</p>
            <p className="text-muted-foreground truncate text-xs">{user.roleLabel}</p>
          </div>
        </div>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuButton onClick={handleLogout} disabled={busy} aria-busy={busy || undefined}>
          {busy ? <LoaderCircle className="animate-spin" /> : <LogOut />}
          <span>{vi.auth.logout}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
