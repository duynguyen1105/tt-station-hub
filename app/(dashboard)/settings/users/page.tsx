import { AccountantForm } from '@/components/accountants/accountant-form'
import { AccountantPasswordForm } from '@/components/accountants/accountant-password-form'
import { AccountantStatusForm } from '@/components/accountants/accountant-status-form'
import { StatusBadge } from '@/components/shared/status-badge'
import { requireRole } from '@/lib/auth/session'
import { isStationUncovered } from '@/lib/auth/station-access'
import { activeStationAccess } from '@/lib/auth/station-guard'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

export default async function SettingsAccountantsPage() {
  await requireRole('admin')

  const [profiles, stationRows, access] = await Promise.all([
    // Every profile, not only the kế toán: the table below is theirs, but the
    // people already on a trạm have to be named whoever they are.
    prisma.profile.findMany({ orderBy: { fullName: 'asc' } }),
    // Active trạm only, as everywhere else a trạm list is read: a closed trạm
    // needs no kế toán, so it belongs in neither column nor coverage count.
    prisma.station.findMany({
      where: { isActive: true },
      select: { id: true, name: true, branch: true },
      orderBy: { code: 'asc' },
    }),
    // Who is on each of them, read through the same module every other screen
    // asks, so this one cannot answer differently from the boundary itself.
    activeStationAccess(),
  ])

  const accountants = profiles.filter((profile) => profile.role === 'accountant')

  // The trạm as this screen needs them: the row's own columns, in mã trạm order,
  // carrying who is phụ trách of it.
  const accountantIdsByStation = new Map(
    access.map((station) => [station.id, station.accountantIds])
  )
  const stations = stationRows.map((station) => ({
    ...station,
    accountantIds: accountantIdsByStation.get(station.id) ?? [],
  }))

  // The same phụ trách read from the other side: which trạm each kế toán is on.
  const stationsHeldBy = new Map<string, string[]>()
  for (const station of stations) {
    for (const accountantId of station.accountantIds) {
      const held = stationsHeldBy.get(accountantId) ?? []
      held.push(station.name)
      stationsHeldBy.set(accountantId, held)
    }
  }

  // A signal, not a constraint: a trạm with no working kế toán is a trạm
  // nobody reviews, and nothing else in the app makes that visible.
  const uncovered = stations.filter((station) => isStationUncovered(station, accountants))

  // The checklist inside the dialog: every active trạm, naming the kế toán
  // already phụ trách of it, since ticking one adds a name beside theirs.
  const stationChoices = stations.map((station) => ({
    id: station.id,
    name: station.name,
    branch: station.branch,
    heldBy: station.accountantIds.flatMap((accountantId) => {
      const holder = profiles.find((profile) => profile.id === accountantId)
      return holder ? [{ id: holder.id, fullName: holder.fullName }] : []
    }),
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="label-micro">{vi.nav.settings}</p>
          <h1 className="text-2xl font-bold tracking-tight">{vi.accountants.title}</h1>
          <p className="text-muted-foreground text-sm">{vi.accountants.subtitle}</p>
        </div>
        <AccountantForm stations={stationChoices} />
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
                  <td className="p-2 text-right whitespace-nowrap">
                    <AccountantForm
                      stations={stationChoices}
                      accountant={{
                        id: accountant.id,
                        fullName: accountant.fullName,
                        username: accountant.email,
                        phone: accountant.phone,
                      }}
                    />
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
