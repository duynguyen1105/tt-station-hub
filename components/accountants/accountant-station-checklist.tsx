'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import type { StationWithHolders } from '@/lib/accountants/station-holders'
import { vi } from '@/messages/vi'

/**
 * Which trạm one kế toán is phụ trách of: one flat list in the order the trạm
 * arrive, which is by mã trạm.
 *
 * A trạm has any number of phụ trách, so ticking one somebody else is on adds
 * this person beside them and unticking one removes only this person — nothing
 * is taken off anybody, and so nothing here warns about it.
 *
 * A row is the trạm's name and nothing else. Who else is on it used to be named
 * beside every one of them, which with the same two kế toán on nearly every trạm
 * said the same thing the whole way down the column; the description above the
 * list says it once instead. The create dialog and the person's page want the
 * same list on the same terms, and so pass the same props.
 */
export function AccountantStationChecklist({
  stations,
  selected,
  onChange,
}: {
  stations: readonly StationWithHolders[]
  selected: readonly string[]
  onChange: (stationIds: string[]) => void
}) {
  const selectedIds = new Set(selected)
  const allSelected = stations.every((station) => selectedIds.has(station.id))
  const someSelected = !allSelected && stations.some((station) => selectedIds.has(station.id))

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
        <div className="rounded-md border">
          {/* Above the columns, not in them: dealt into a column it would read as
              the first trạm of the list rather than as a heading over all of them.

              Unticking it on a person's page lets go of every trạm they hold — a
              wide stroke, but one that moves checkboxes and nothing else: nothing
              is written until Lưu. */}
          <label className="hover:bg-muted/50 flex items-center gap-2 border-b px-2 py-1.5 text-sm leading-tight font-medium transition-colors">
            <Checkbox
              checked={allSelected ? true : someSelected ? 'indeterminate' : false}
              onCheckedChange={(state) =>
                onChange(state === true ? stations.map((station) => station.id) : [])
              }
            />
            <span>{vi.accountants.stationsSelectAll}</span>
          </label>
          {/* Columns rather than a grid: the trạm arrive in mã trạm order, and a grid
              would deal them across the rows, so reading down a column would skip
              every other name. */}
          <div className="p-2 @lg/stations:columns-2 @lg/stations:gap-x-4">
            {stations.map((station) => (
              <label
                key={station.id}
                className="hover:bg-muted/50 flex break-inside-avoid items-start gap-2 rounded-sm px-2 py-1.5 text-sm leading-tight transition-colors"
              >
                <Checkbox
                  className="mt-0.5"
                  checked={selectedIds.has(station.id)}
                  onCheckedChange={(state) => toggle(station.id, state === true)}
                />
                {station.name}
              </label>
            ))}
          </div>
        </div>
      )}
    </Field>
  )
}
