import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AccountantDetailForm } from '@/components/accountants/accountant-detail-form'
import { activeStationsWithHolders } from '@/lib/accountants/station-holders'
import { requireRole } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

/**
 * One kế toán: who they are and what they are phụ trách of, corrected in one
 * place. Quản trị viên only, like the list it hangs off — a kế toán reaching
 * here could otherwise grant themselves another trạm.
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

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="label-micro">
          <Link href="/settings/users" className="hover:underline">
            {vi.accountants.title}
          </Link>
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{accountant.fullName}</h1>
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
