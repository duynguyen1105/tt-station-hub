import Link from 'next/link'

import { AccountantForm } from '@/components/accountants/accountant-form'
import { AccountantPasswordForm } from '@/components/accountants/accountant-password-form'
import { AccountantStatusForm } from '@/components/accountants/accountant-status-form'
import { StatusBadge } from '@/components/shared/status-badge'
import { activeStationsWithHolders } from '@/lib/accountants/station-holders'
import { requireRole } from '@/lib/auth/session'
import { isStationUncovered } from '@/lib/auth/station-access'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

export default async function SettingsAccountantsPage() {
  await requireRole('admin')

  const [accountants, stations] = await Promise.all([
    prisma.profile.findMany({ where: { role: 'accountant' }, orderBy: { fullName: 'asc' } }),
    activeStationsWithHolders(),
  ])

  // The same phụ trách read from the other side: which trạm each kế toán is on.
  const stationsHeldBy = new Map<string, string[]>()
  for (const station of stations) {
    for (const holder of station.heldBy) {
      const held = stationsHeldBy.get(holder.id) ?? []
      held.push(station.name)
      stationsHeldBy.set(holder.id, held)
    }
  }

  // A signal, not a constraint: a trạm with no working kế toán is a trạm
  // nobody reviews, and nothing else in the app makes that visible.
  const uncovered = stations.filter((station) =>
    isStationUncovered(
      { id: station.id, accountantIds: station.heldBy.map((holder) => holder.id) },
      accountants
    )
  )

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="label-micro">{vi.nav.settings}</p>
          <h1 className="text-2xl font-bold tracking-tight">{vi.accountants.title}</h1>
          <p className="text-muted-foreground text-sm">{vi.accountants.subtitle}</p>
        </div>
        <AccountantForm stations={stations} />
      </div>

      <p className="text-sm">
        {uncovered.length === 0 ? (
          <span className="text-muted-foreground">{vi.accountants.uncoveredNone}</span>
        ) : (
          <>
            <span className="font-medium">
              {vi.accountants.uncoveredPrefix} {uncovered.length}/{stations.length}
            </span>
            <span className="text-muted-foreground">
              {' — '}
              {uncovered.map((station) => station.name).join(', ')}
            </span>
          </>
        )}
      </p>

      {accountants.length === 0 ? (
        <p className="text-muted-foreground text-sm">{vi.accountants.empty}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th className="p-2">{vi.accountants.fullName}</th>
              <th className="p-2">{vi.accountants.username}</th>
              <th className="p-2">{vi.accountants.phone}</th>
              <th className="p-2">{vi.accountants.assignedStations}</th>
              <th className="p-2">{vi.accountants.accountStatus}</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {accountants.map((accountant) => {
              const held = stationsHeldBy.get(accountant.id)
              return (
                <tr key={accountant.id} className="border-b">
                  {/* The row's handle on the person: opening one is the obvious
                      thing to do to a row, and it is where they are edited. */}
                  <td className="p-2">
                    <Link
                      href={`/settings/users/${accountant.id}`}
                      className="font-medium hover:underline"
                    >
                      {accountant.fullName}
                    </Link>
                  </td>
                  <td className="p-2 font-mono">{accountant.email}</td>
                  <td className="p-2 font-mono">{accountant.phone ?? '—'}</td>
                  <td className="p-2">
                    {held ? (
                      held.join(', ')
                    ) : (
                      <span className="text-muted-foreground">{vi.accountants.noStations}</span>
                    )}
                  </td>
                  <td className="p-2">
                    {accountant.isActive ? (
                      <StatusBadge label={vi.accountants.active} tone="success" />
                    ) : (
                      <StatusBadge label={vi.accountants.suspended} tone="muted" />
                    )}
                  </td>
                  <td className="p-2 text-right whitespace-nowrap">
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
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
