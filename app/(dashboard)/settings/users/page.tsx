import Link from 'next/link'

import { AccountantForm } from '@/components/accountants/accountant-form'
import { StationOverflow } from '@/components/accountants/station-overflow'
import { StatusBadge } from '@/components/shared/status-badge'
import { activeStationsWithHolders } from '@/lib/accountants/station-holders'
import { requireRole } from '@/lib/auth/session'
import { isStationUncovered } from '@/lib/auth/station-access'
import { prisma } from '@/lib/prisma'
import { accountantStatusInfo } from '@/lib/ui/status'
import { vi } from '@/messages/vi'

/**
 * How many trạm the cell names before the rest go behind a `+N`. Fixed rather
 * than fitted to the width: fitting would mean measuring, and a measurement the
 * server cannot take is a measurement the two of them can disagree about.
 */
const VISIBLE_STATIONS = 3

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
            </tr>
          </thead>
          <tbody>
            {accountants.map((accountant) => {
              const held = stationsHeldBy.get(accountant.id) ?? []
              // Nothing marks a kế toán as covering everything, so covering
              // everything is only ever what today's count says — put a trạm on
              // and whoever was not given it stops reading as all of them, which
              // is the truth about them rather than a lapse in the display.
              //
              // Only worth saying where naming them would not have fitted: with
              // two or three trạm in the whole company, "Tất cả 3 trạm" is the
              // same length as the three names and tells the reader less.
              const coversAll =
                stations.length > VISIBLE_STATIONS && held.length === stations.length
              const hidden = held.slice(VISIBLE_STATIONS)
              const status = accountantStatusInfo(accountant.isActive)
              return (
                <tr key={accountant.id} className="border-b">
                  {/* The only thing a row offers, now that mật khẩu and ngưng
                      hoạt động sit on the person's page with everything else
                      done to them: the list says who there is, and points. */}
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
                  {/* A row's worth of trạm, said in a row's worth of height:
                      the whole list was a paragraph in a table of short values,
                      and the one thing worth knowing about somebody phụ trách of
                      all of them was the thing you had to count to find out. */}
                  <td className="p-2">
                    {held.length === 0 ? (
                      <span className="text-muted-foreground">{vi.accountants.noStations}</span>
                    ) : coversAll ? (
                      vi.accountants.allStations(stations.length)
                    ) : (
                      <span className="inline-flex items-baseline gap-1.5">
                        {held.slice(0, VISIBLE_STATIONS).join(', ')}
                        {hidden.length > 0 ? <StationOverflow names={hidden} /> : null}
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    <StatusBadge label={status.label} tone={status.tone} />
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
