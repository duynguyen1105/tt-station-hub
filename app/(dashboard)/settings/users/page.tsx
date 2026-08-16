import { AccountantForm } from '@/components/accountants/accountant-form'
import { StatusBadge } from '@/components/shared/status-badge'
import { requireRole } from '@/lib/auth/session'
import { isStationUncovered } from '@/lib/auth/station-access'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

export default async function SettingsAccountantsPage() {
  await requireRole('admin')

  const [accountants, stations] = await Promise.all([
    prisma.profile.findMany({ where: { role: 'accountant' }, orderBy: { fullName: 'asc' } }),
    // Active trạm only, as everywhere else a trạm list is read: a closed trạm
    // needs no kế toán, so it belongs in neither column nor coverage count.
    prisma.station.findMany({
      where: { isActive: true },
      select: { id: true, name: true, assignedAccountantId: true },
      orderBy: { code: 'asc' },
    }),
  ])

  // The assigned-accountant column read from the other side: which trạm each
  // kế toán is phụ trách of.
  const stationsHeldBy = new Map<string, string[]>()
  for (const station of stations) {
    if (!station.assignedAccountantId) continue
    const held = stationsHeldBy.get(station.assignedAccountantId) ?? []
    held.push(station.name)
    stationsHeldBy.set(station.assignedAccountantId, held)
  }

  // A signal, not a constraint: a trạm with no working kế toán is a trạm
  // nobody reviews, and nothing else in the app makes that visible.
  const uncovered = stations.filter((station) => isStationUncovered(station, accountants))

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="label-micro">{vi.nav.settings}</p>
          <h1 className="text-2xl font-bold tracking-tight">{vi.accountants.title}</h1>
          <p className="text-muted-foreground text-sm">{vi.accountants.subtitle}</p>
        </div>
        <AccountantForm />
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
            </tr>
          </thead>
          <tbody>
            {accountants.map((accountant) => {
              const held = stationsHeldBy.get(accountant.id)
              return (
                <tr key={accountant.id} className="border-b">
                  <td className="p-2">{accountant.fullName}</td>
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
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
