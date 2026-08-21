import { ChevronRight } from 'lucide-react'

import Link from 'next/link'

import { StatusBadge } from '@/components/shared/status-badge'
import { ShiftFilterForm } from '@/components/shifts/shift-filter-form'
import { requireStationAccess } from '@/lib/auth/station-guard'
import { matchingDatePreset } from '@/lib/filters/date-presets'
import { filterHref } from '@/lib/filters/params'
import { formatDate } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import {
  SHIFT_LIST_PAGE_SIZE,
  hasShiftListFilter,
  shiftListSelection,
} from '@/lib/shifts/shift-list-selection'
import { shiftStatusInfo, shiftTypeLabel } from '@/lib/ui/status'
import { vi } from '@/messages/vi'

export default async function StationShiftsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string; to?: string; status?: string; page?: string }>
}) {
  const { id } = await params
  await requireStationAccess(id)
  const selection = shiftListSelection(await searchParams, id)
  const { where, orderBy, skip, take, page } = selection
  // The count rides along with the page it describes: this tab used to stop at fifty ca
  // without saying so, so what is on screen now says how much there is.
  const [shifts, total] = await Promise.all([
    prisma.shift.findMany({ where, orderBy, skip, take }),
    prisma.shift.count({ where }),
  ])
  // Which preset, if any, these two ngày are — read here rather than in the browser, so
  // the tick beside Tháng này can't disagree with itself across midnight.
  const activePreset = matchingDatePreset(selection.from, selection.to, new Date())
  const lastPage = Math.max(1, Math.ceil(total / SHIFT_LIST_PAGE_SIZE))

  const base = `/stations/${id}/shifts`
  // Paging keeps the filter: stepping to page 2 must not silently widen what is being
  // looked at. Only the criteria that actually applied are carried.
  const pageHref = (p: number) =>
    filterHref(base, { from: selection.from, to: selection.to, status: selection.statuses }, p)

  return (
    <div className="space-y-3">
      {/* The bộ lọc renders whether or not the list does: a filter that matched nothing
          has to stay undoable, and this used to return early on an empty list. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ShiftFilterForm
          from={selection.from}
          to={selection.to}
          statuses={selection.statuses}
          activePreset={activePreset}
        />
        <span className="text-muted-foreground text-sm">{vi.shifts.total(total)}</span>
      </div>
      {shifts.length === 0 ? (
        // A filtered list that matched nothing says so: "Chưa có ca nào." would read as
        // the trạm never having had a ca, which is wrong when the truth is that the
        // filter is too narrow. It is the total that decides, not this page, so a stale
        // link past the last page doesn't deny the count sitting right above it.
        <p className="text-muted-foreground text-sm">
          {total === 0 && hasShiftListFilter(selection) ? vi.shifts.emptyFiltered : vi.shifts.empty}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <div className="text-muted-foreground bg-muted/50 grid grid-cols-[1.2fr_1fr_1fr_auto] items-center gap-3 border-b px-3 py-2.5">
            <span className="label-micro">{vi.shifts.date}</span>
            <span className="label-micro">{vi.shifts.shiftType}</span>
            <span className="label-micro">{vi.shifts.status}</span>
            <span></span>
          </div>
          {shifts.map((shift) => {
            const status = shiftStatusInfo(shift.status)
            return (
              <Link
                key={shift.id}
                href={`/stations/${id}/shifts/${shift.id}`}
                className="hover:bg-muted/40 grid grid-cols-[1.2fr_1fr_1fr_auto] items-center gap-3 border-b px-3 py-3 text-sm transition-colors last:border-0"
              >
                <span>{formatDate(shift.shiftDate)}</span>
                <span>{shiftTypeLabel(shift.shiftType)}</span>
                <span>
                  <StatusBadge label={status.label} tone={status.tone} />
                </span>
                <span className="text-primary inline-flex items-center gap-1 font-medium whitespace-nowrap">
                  {vi.shifts.viewDetail}
                  <ChevronRight className="size-4" />
                </span>
              </Link>
            )
          })}
        </div>
      )}
      {(lastPage > 1 || page > lastPage) && (
        <div className="flex items-center justify-end gap-3 text-sm">
          {page > 1 ? (
            // A stale link past the last page steps back onto the last real page,
            // rather than to another empty one.
            <Link
              href={pageHref(Math.min(page - 1, lastPage))}
              className="text-primary underline underline-offset-2"
            >
              {vi.common.pagePrev}
            </Link>
          ) : (
            <span className="text-muted-foreground">{vi.common.pagePrev}</span>
          )}
          <span className="text-muted-foreground">
            {vi.common.pageOf} {Math.min(page, lastPage)}/{lastPage}
          </span>
          {page < lastPage ? (
            <Link href={pageHref(page + 1)} className="text-primary underline underline-offset-2">
              {vi.common.pageNext}
            </Link>
          ) : (
            <span className="text-muted-foreground">{vi.common.pageNext}</span>
          )}
        </div>
      )}
    </div>
  )
}
