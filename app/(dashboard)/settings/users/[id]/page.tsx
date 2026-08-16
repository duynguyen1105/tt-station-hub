import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AccountantDetailForm } from '@/components/accountants/accountant-detail-form'
import { AccountantPasswordForm } from '@/components/accountants/accountant-password-form'
import { AccountantStatusForm } from '@/components/accountants/accountant-status-form'
import { StatusBadge } from '@/components/shared/status-badge'
import { activeStationsWithHolders } from '@/lib/accountants/station-holders'
import { requireRole } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'
import { accountantStatusInfo } from '@/lib/ui/status'
import { vi } from '@/messages/vi'

/**
 * One kế toán: who they are, what they are phụ trách of, and everything done to
 * them — corrected, given a new mật khẩu, ngưng hoạt động and kích hoạt lại — in
 * one place. Quản trị viên only, like the list it hangs off, and for more than
 * the trạm now: a kế toán reaching here could otherwise grant themselves another
 * trạm or set their own password.
 */
export default async function AccountantPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole('admin')
  const { id } = await params

  const [accountant, stations] = await Promise.all([
    prisma.profile.findUnique({ where: { id } }),
    activeStationsWithHolders(),
  ])

  // This screen is the kế toán screen. A quản trị viên, or an id matching nobody,
  // is not found here — the same answer the update endpoint already gives.
  if (!accountant || accountant.role !== 'accountant') notFound()

  const status = accountantStatusInfo(accountant.isActive)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="label-micro">
            <Link href="/settings/users" className="hover:underline">
              {vi.accountants.title}
            </Link>
          </p>
          <h1 className="text-2xl font-bold tracking-tight">{accountant.fullName}</h1>
          {/* Said here because this is where it is now changed: the control beside
              it offers one of the two actions, and which one only makes sense
              against the state it is leaving. */}
          <StatusBadge label={status.label} tone={status.tone} />
        </div>
        {/* Beside the person rather than on a row in a list: both act on this one
            kế toán, and the list is no longer a place where things are done. */}
        <div className="flex items-center gap-2">
          <AccountantPasswordForm
            accountant={{
              id: accountant.id,
              fullName: accountant.fullName,
              username: accountant.email,
            }}
          />
          <AccountantStatusForm
            accountant={{
              id: accountant.id,
              fullName: accountant.fullName,
              isActive: accountant.isActive,
            }}
          />
        </div>
      </div>

      <AccountantDetailForm
        accountant={{
          id: accountant.id,
          fullName: accountant.fullName,
          username: accountant.email,
          phone: accountant.phone,
        }}
        stations={stations}
      />
    </div>
  )
}
