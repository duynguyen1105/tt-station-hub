'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import type { StationWithHolders } from '@/lib/accountants/station-holders'
import { planStationAssignment } from '@/lib/auth/station-assignment'
import { vi } from '@/messages/vi'

/**
 * Which trạm one kế toán is phụ trách of: one flat list in the order the trạm
 * arrive, which is by mã trạm.
 *
 * A trạm has any number of phụ trách, so ticking one somebody else is on adds
 * this person beside them and unticking one removes only this person — nothing
 * is taken off anybody, and so nothing here warns about it.
 *
 * Shared by the create dialog and the person's page, which differ in one thing
 * only: a kế toán being created has no id yet, so `accountantId` is left off.
 * Nobody on a trạm is then them, which means no row names them as a colleague
 * and everything ticked is a claim.
 */
export function AccountantStationChecklist({
  accountantId,
  stations,
  selected,
  onChange,
}: {
  /** Whose assignment this is, or absent while the kế toán is being created. */
  accountantId?: string
  stations: readonly StationWithHolders[]
  selected: readonly string[]
  onChange: (stationIds: string[]) => void
}) {
  // What saving would do, worked out by the same function the route will run, so
  // what is marked on screen is the writes themselves rather than a second opinion
  // about them. Nobody carries the empty id a kế toán being created stands in with,
  // so nothing is ever released there.
  const plan = planStationAssignment(
    accountantId ?? '',
    stations.map((station) => ({
      id: station.id,
      accountantIds: station.heldBy.map((holder) => holder.id),
    })),
    selected
  )
  const released = new Set(plan.released)
  const selectedIds = new Set(selected)

  function toggle(stationId: string, ticked: boolean) {
    onChange(ticked ? [...selected, stationId] : selected.filter((id) => id !== stationId))
  }

  return (
    // Measured against itself, not the window: the same list is the whole width of
    // a page column here and a narrow dialog on the list, and only one of those
    // has room for two trạm side by side.
    <Field className="@container/stations">
      <FieldLabel>{vi.accountants.assignedStations}</FieldLabel>
      <FieldDescription>{vi.accountants.stationsHint}</FieldDescription>
      {stations.length === 0 ? (
        <p className="text-muted-foreground text-sm">{vi.stations.empty}</p>
      ) : (
        // Columns rather than a grid: the trạm arrive in mã trạm order, and a grid
        // would deal them across the rows, so reading down a column would skip
        // every other name.
        <div className="rounded-md border p-2 @lg/stations:columns-2 @lg/stations:gap-x-4">
          {/* A row says the trạm's name, and adds something only when there is
              something to say — a trạm nobody is on is not an opportunity to take
              one, so it says nothing at all. */}
          {stations.map((station) => {
            // The people already on it besides the one being edited — ticking is
            // adding a name beside theirs, not taking it.
            const others = station.heldBy.filter((holder) => holder.id !== accountantId)
            return (
              <label
                key={station.id}
                className="hover:bg-muted/50 flex break-inside-avoid items-start gap-2 rounded-sm px-2 py-1.5 text-sm leading-tight transition-colors"
              >
                <Checkbox
                  className="mt-0.5"
                  checked={selectedIds.has(station.id)}
                  onCheckedChange={(state) => toggle(station.id, state === true)}
                />
                {/* The space belongs to what follows the name, not to the name: a
                    row that says nothing more ends at its own last letter. */}
                <span>
                  {station.name}
                  {released.has(station.id) ? (
                    <span className="text-amber-700 dark:text-amber-400">
                      {' '}
                      {vi.accountants.stationRelease}
                    </span>
                  ) : others.length > 0 ? (
                    <span className="text-muted-foreground">
                      {' '}
                      {vi.accountants.stationHeldBy}{' '}
                      {others.map((holder) => holder.fullName).join(', ')}
                    </span>
                  ) : null}
                </span>
              </label>
            )
          })}
        </div>
      )}
    </Field>
  )
}
