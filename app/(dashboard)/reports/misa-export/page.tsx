import Link from 'next/link'

import { ExportPreflightDialog } from '@/components/misa-export/export-preflight-dialog'
import { ReportFilterForm } from '@/components/misa-export/report-filter-form'
import { StatusBadge } from '@/components/shared/status-badge'
import { requireUser } from '@/lib/auth/session'
import { reachableStationIds } from '@/lib/auth/station-guard'
import { formatDate } from '@/lib/format'
import { APPROVED_VISIT_STATUSES } from '@/lib/misa-export/debts-list'
import {
  MISA_REPORT_PAGE_SIZE,
  hasMisaReportFilter,
  misaReportSelection,
} from '@/lib/misa-export/report-selection'
import { prisma } from '@/lib/prisma'
import { shiftIdsWithLateDebtApproval, visitDateSpan } from '@/lib/shifts/late-debt-approval'
import { shiftTypeLabel } from '@/lib/ui/status'
import { vi } from '@/messages/vi'

export default async function MisaExportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; station?: string; page?: string }>
}) {
  const user = await requireUser()
  // A kế toán is offered the ca of the trạm they are phụ trách of, and the
  // narrowing happens in the query: the rows below are rows of their own work
  // rather than whatever survives someone else's more recent ca. Phụ trách of
  // none is the empty table, not an error.
  const stationIds = await reachableStationIds(user)
  const selection = misaReportSelection(await searchParams, stationIds)
  const { where, orderBy, skip, take, page } = selection
  // The count rides along with the page it describes: a list that hides rows is
  // the bug this screen had, so what is on screen says how much there is.
  const [shifts, total, stations] = await Promise.all([
    prisma.shift.findMany({ where, orderBy, skip, take }),
    prisma.shift.count({ where }),
    // Every trạm the viewer can reach, closed ones included — the names the table
    // prints and, in the same read, the options the trạm dropdown offers.
    prisma.station.findMany({
      where: { id: { in: stationIds } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])
  const stationNameById = new Map(stations.map((s) => [s.id, s.name]))
  const lastPage = Math.max(1, Math.ceil(total / MISA_REPORT_PAGE_SIZE))

  // Which of these ca gained a bán nợ after it was chốt'd — read here, where the ca
  // is offered for export, because that is where an out-of-date MISA file is about to
  // be trusted. One query for the whole table, bounded by the ngày this page's ca span.
  const span = visitDateSpan(shifts)
  const reviewedVisits =
    span === null
      ? []
      : await prisma.debtVehicleVisit.findMany({
          where: {
            stationId: { in: stationIds },
            reviewStatus: { in: APPROVED_VISIT_STATUSES },
            visitDate: { gte: span.start, lt: span.end },
            reviewedAt: { not: null },
          },
          select: { stationId: true, visitDate: true, reviewStatus: true, reviewedAt: true },
        })
  const lateDebtShiftIds = shiftIdsWithLateDebtApproval(shifts, reviewedVisits)

  const base = '/reports/misa-export'
  // Paging keeps the filter: stepping to page 2 must not silently widen what
  // kế toán is looking at. Only the bounds that actually applied are carried.
  const pageHref = (p: number) => {
    const query = new URLSearchParams()
    if (selection.from) query.set('from', selection.from)
    if (selection.to) query.set('to', selection.to)
    if (selection.station) query.set('station', selection.station)
    if (p > 1) query.set('page', String(p))
    const qs = query.toString()
    return qs ? `${base}?${qs}` : base
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{vi.nav.misaReport}</h1>
        <span className="text-muted-foreground text-sm">{vi.misaExport.reportTotal(total)}</span>
      </div>
      {/* Keyed by the filter as applied, so the URL stays the one source of truth:
          stepping Back onto a different filter remounts the inputs onto it rather
          than leaving a trạm on screen that the rows below are no longer of. */}
      <ReportFilterForm
        key={`${selection.from ?? ''}|${selection.to ?? ''}|${selection.station ?? ''}`}
        from={selection.from}
        to={selection.to}
        station={selection.station}
        stations={stations}
      />
      {shifts.length === 0 ? (
        // A filtered list that matched nothing says so: "Chưa có ca nào." would read
        // as the system holding no ca at all, which is alarming and wrong when the
        // truth is that the filter is too narrow. A ca is never removed from this
        // list, so a filter matching none of them is the only thing this can mean.
        //
        // It is the total that decides, not this page: a stale link past the last
        // page of a filter that matched plenty would otherwise deny the count sitting
        // right above it.
        <p className="text-muted-foreground text-sm">
          {total === 0 && hasMisaReportFilter(selection)
            ? vi.misaExport.reportEmptyFiltered
            : vi.shifts.empty}
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th className="p-2">{vi.shifts.station}</th>
              <th className="p-2">{vi.shifts.date}</th>
              <th className="p-2">{vi.shifts.shiftType}</th>
              <th className="p-2"></th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((shift) => (
              <tr key={shift.id} className="border-b">
                <td className="p-2">{stationNameById.get(shift.stationId) ?? '—'}</td>
                <td className="p-2">{formatDate(shift.shiftDate)}</td>
                <td className="p-2">{shiftTypeLabel(shift.shiftType)}</td>
                <td className="p-2">
                  {lateDebtShiftIds.has(shift.id) && (
                    <StatusBadge label={vi.shifts.lateDebtApproval} tone="warning" />
                  )}
                </td>
                <td className="p-2 text-right">
                  <ExportPreflightDialog
                    shiftId={shift.id}
                    stationId={shift.stationId}
                    shiftDate={shift.shiftDate.toISOString().slice(0, 10)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {(lastPage > 1 || page > lastPage) && (
        <div className="flex items-center justify-end gap-3 text-sm">
          {page > 1 ? (
            // A stale link past the last page steps back onto the last real
            // page, rather than to another empty one.
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
