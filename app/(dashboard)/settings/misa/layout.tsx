import { type ReactNode } from 'react'

import { MisaSettingsTabs } from '@/components/misa-export/misa-settings-tabs'
import { requireRole } from '@/lib/auth/session'
import { vi } from '@/messages/vi'

export default async function MisaSettingsLayout({ children }: { children: ReactNode }) {
  await requireRole(['admin', 'accountant'])

  return (
    <div className="space-y-6">
      <div>
        <p className="label-micro">Cài đặt</p>
        <h1 className="text-2xl font-bold tracking-tight">{vi.misaSettings.title}</h1>
      </div>
      <MisaSettingsTabs />
      {children}
    </div>
  )
}
