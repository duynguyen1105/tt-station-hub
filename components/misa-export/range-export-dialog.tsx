'use client'

import { useRef, useState } from 'react'

import Link from 'next/link'

import { fixLink } from '@/components/misa-export/export-preflight-dialog'
import { FuelSummaryTable } from '@/components/misa-export/fuel-summary-table'
import { DATE_PRESET_OPTIONS, dayLabel } from '@/components/shared/date-filter-items'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { type DatePreset, datePresetRange, matchingDatePreset } from '@/lib/filters/date-presets'
import type { CashVoucherKind } from '@/lib/misa-export/build-cash-vouchers'
import type { RangeShiftProblem } from '@/lib/misa-export/build-range-export'
import type { FuelSummary } from '@/lib/misa-export/build-sales-voucher'
import { cn } from '@/lib/utils'
import { vi } from '@/messages/vi'

type RangePreflight = {
  shiftCount: number
  fuelSummary: FuelSummary[]
  problems: RangeShiftProblem[]
  cashVoucherCounts: Record<CashVoucherKind, number>
}

/** What kế toán has picked: the khoảng ngày bán and the trạm, by id. */
type RangePick = { from: string; to: string; stations: string[] }

/**
 * Xuất MISA theo kỳ: kế toán picks trạm and a khoảng ngày bán in the hộp thoại itself and
 * downloads one Chứng từ bán hàng, one Phiếu thu and one Phiếu chi holding every chốt'd ca
 * of them — the month-close the one-ca Xuất MISA would take dozens of clicks for.
 *
 * It opens on what the Báo cáo MISA bộ lọc already shows, so a list narrowed to tháng 9 at
 * two trạm exports exactly that list; with no trạm in the bộ lọc it opens with none ticked,
 * and with no ngày on Tháng trước, the khoảng kế toán closes at the start of a month. Every change re-checks the khoảng
 * with the same gates as one ca: any ca with an error is listed with its Sửa and holds the
 * sales file back; warnings need the confirm box.
 */
export function RangeExportDialog({
  stationOptions,
  from,
  to,
  stations,
}: {
  stationOptions: { id: string; code: string }[]
  /** The bộ lọc's Từ ngày / Đến ngày, `YYYY-MM-DD`, if set. */
  from?: string
  to?: string
  /** The bộ lọc's trạm, by id; empty for tất cả trạm. */
  stations: string[]
}) {
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState<RangePick>({ from: '', to: '', stations: [] })
  const [preset, setPreset] = useState<DatePreset | undefined>(undefined)
  const [result, setResult] = useState<RangePreflight | null>(null)
  const [loading, setLoading] = useState(false)
  // Why the check failed, as the server put it (or its HTTP status); null when it didn't.
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  // The check in flight: a newer pick aborts it, so an older answer never lands last.
  const inFlight = useRef<AbortController | null>(null)

  const allIds = stationOptions.map((s) => s.id)
  // Every trạm ticked is sent as none: the same tất cả trạm the bộ lọc means by none.
  const query = (p: RangePick) => {
    const params = new URLSearchParams({ from: p.from, to: p.to })
    if (p.stations.length < allIds.length) params.set('station', p.stations.join(','))
    return params
  }

  function update(next: RangePick) {
    setPick(next)
    setPreset(matchingDatePreset(next.from, next.to, new Date()))
    setConfirmed(false)
    setLoadError(null)
    inFlight.current?.abort()
    if (!next.from || !next.to || next.stations.length === 0) {
      setResult(null)
      setLoading(false)
      return
    }
    // The last result stays up, dimmed, until this one lands, so a re-check never empties
    // the dialog and fills it again.
    const controller = new AbortController()
    inFlight.current = controller
    setLoading(true)
    const params = query(next)
    params.set('preflight', '1')
    fetch(`/api/misa-export?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (res.ok) return res.json()
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      })
      .then((data: RangePreflight) => setResult(data))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setResult(null)
        setLoadError(error instanceof Error ? error.message : '')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      inFlight.current?.abort()
      return
    }
    const dates = from && to ? { from, to } : datePresetRange('lastMonth', new Date())
    // No trạm ticked unless the bộ lọc names some: kế toán picks them, rather than unticking from all.
    update({ ...dates, stations })
  }

  function toggleStation(id: string, checked: boolean) {
    const picked = new Set(checked ? [...pick.stations, id] : pick.stations.filter((s) => s !== id))
    // Kept in the order the trạm are listed, so the same pick is always the same query.
    update({ ...pick, stations: allIds.filter((s) => picked.has(s)) })
  }

  const allPicked = pick.stations.length === allIds.length
  const nonePicked = pick.stations.length === 0
  const blocked = result?.problems.filter((p) => p.errors.length > 0) ?? []
  const warned = result?.problems.filter((p) => p.warnings.length > 0) ?? []
  const hasErrors = blocked.length > 0
  const hasWarnings = warned.length > 0
  const hasShifts = (result?.shiftCount ?? 0) > 0
  const canDownload = !loading && hasShifts && !hasErrors && (!hasWarnings || confirmed)
  const salesParams = query(pick)
  if (hasWarnings) salesParams.set('confirm', '1')
  // A result being re-checked stays up, dimmed, until the new one lands.
  const stale = cn('transition-opacity', loading && 'opacity-50')

  // What the summary says in place of the table while there is no table to show.
  const notice = nonePicked ? (
    vi.misaExport.rangeNeedsStation
  ) : !pick.from || !pick.to ? (
    vi.misaExport.rangeNeedsDates
  ) : loadError !== null ? (
    <span className="text-destructive">
      {vi.misaExport.loadError}
      {loadError && <span className="block">{loadError}</span>}
    </span>
  ) : result === null ? (
    vi.misaExport.loading
  ) : (
    vi.misaExport.rangeEmpty
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">{vi.misaExport.rangeAction}</Button>
      </DialogTrigger>
      {/* Anchored at the top, so whatever the check adds or drops below only grows or
          shrinks the dialog downward; the controls being clicked never move. */}
      <DialogContent className="top-[5vh] max-h-[90vh] translate-y-0 [scrollbar-gutter:stable] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{vi.misaExport.rangeTitle}</DialogTitle>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          {/* Not a <Field>: the list of trạm is many controls under one name. */}
          <section className="space-y-2">
            <h3 className="text-sm font-medium">{vi.misaExport.rangeStations}</h3>
            <label className="flex w-fit items-center gap-2 text-sm">
              <Checkbox
                checked={allPicked ? true : nonePicked ? false : 'indeterminate'}
                onCheckedChange={() => update({ ...pick, stations: allPicked ? [] : allIds })}
              />
              <span>{vi.misaExport.rangeAllStations}</span>
            </label>
            <div className="grid max-h-40 grid-cols-2 gap-x-4 gap-y-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-3">
              {stationOptions.map((station) => (
                <label key={station.id} className="flex min-w-0 items-center gap-2 text-sm">
                  <Checkbox
                    checked={pick.stations.includes(station.id)}
                    onCheckedChange={(checked) => toggleStation(station.id, checked === true)}
                  />
                  <span className="truncate">{station.code}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-medium">{vi.misaExport.rangeSaleDate}</h3>
            <div className="flex flex-wrap gap-2">
              {DATE_PRESET_OPTIONS.map((option) => (
                <Button
                  key={option.preset}
                  size="sm"
                  variant={preset === option.preset ? 'secondary' : 'outline'}
                  aria-pressed={preset === option.preset}
                  onClick={() => update({ ...pick, ...datePresetRange(option.preset, new Date()) })}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="rangeFrom">{vi.common.fromDate}</FieldLabel>
                <Input
                  id="rangeFrom"
                  type="date"
                  value={pick.from}
                  max={pick.to || undefined}
                  onChange={(e) => update({ ...pick, from: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="rangeTo">{vi.common.toDate}</FieldLabel>
                <Input
                  id="rangeTo"
                  type="date"
                  value={pick.to}
                  min={pick.from || undefined}
                  onChange={(e) => update({ ...pick, to: e.target.value })}
                />
              </Field>
            </div>
          </section>

          {/* Always here, table or not: the space it takes is about what the table takes,
              so picking the first station doesn't push everything below it down. */}
          <section className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-medium">{vi.misaExport.fuelMathTitle}</h3>
              {result !== null && hasShifts && (
                <span className="text-muted-foreground text-sm whitespace-nowrap">
                  {loading
                    ? vi.misaExport.loading
                    : vi.misaExport.rangeShiftCount(result.shiftCount)}
                </span>
              )}
            </div>
            {result !== null && hasShifts ? (
              <div className={stale} aria-busy={loading}>
                <FuelSummaryTable summary={result.fuelSummary} />
              </div>
            ) : (
              <p className="text-muted-foreground flex min-h-44 flex-col items-center justify-center rounded-md border border-dashed p-4 text-center text-sm">
                {notice}
              </p>
            )}
          </section>

          {result !== null && hasShifts && (
            <>
              {hasErrors && (
                <section className={cn('space-y-2', stale)}>
                  <h3 className="text-destructive text-sm font-medium">
                    {vi.misaExport.rangeProblemsTitle}
                  </h3>
                  <ul className="space-y-2">
                    {blocked.map((problem) => (
                      <li key={problem.shiftId} className="space-y-2 rounded-md border p-2 text-sm">
                        <p className="font-medium">
                          {problem.stationCode} · {dayLabel(problem.shiftDate)}
                        </p>
                        {problem.errors.map((error, i) => (
                          <div key={i} className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p>{vi.misaExport.errorCodes[error.code]}</p>
                              <p className="text-muted-foreground">{error.message}</p>
                            </div>
                            <Button asChild size="sm" variant="outline">
                              <Link href={fixLink(error, problem.stationCode)}>
                                {vi.misaExport.fix}
                              </Link>
                            </Button>
                          </div>
                        ))}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {!hasErrors && hasWarnings && (
                <section className={cn('space-y-2', stale)}>
                  <h3 className="text-sm font-medium">{vi.misaExport.rangeWarningTitle}</h3>
                  <ul className="text-muted-foreground space-y-1 text-sm">
                    {warned.flatMap((problem) =>
                      problem.warnings.map((warning, i) => (
                        <li key={`${problem.shiftId}-${i}`}>
                          <span className="text-foreground font-medium">
                            {problem.stationCode} · {dayLabel(problem.shiftDate)}
                          </span>
                          {' — '}
                          {warning.message}
                        </li>
                      ))
                    )}
                  </ul>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={confirmed}
                      disabled={loading}
                      onCheckedChange={(checked) => setConfirmed(checked === true)}
                    />
                    {vi.misaExport.negativeCashConfirm}
                  </label>
                </section>
              )}
            </>
          )}

          {/* Always here too, its buttons held back until there is something to download. */}
          <section className="space-y-2">
            <h3 className="text-sm font-medium">{vi.misaExport.downloadTitle}</h3>
            <div className="flex flex-wrap justify-end gap-2">
              <Button asChild={canDownload} disabled={!canDownload}>
                {canDownload ? (
                  <a href={`/api/misa-export?${salesParams.toString()}`}>
                    {vi.misaExport.downloadSales}
                  </a>
                ) : (
                  <span>{vi.misaExport.downloadSales}</span>
                )}
              </Button>
              {(['receipt', 'payment'] as const).map((kind) => {
                const count = result?.cashVoucherCounts[kind] ?? 0
                const name = vi.misaExport.cashVoucher[kind]
                const label = result ? vi.misaExport.downloadCash(name, count) : name
                const enabled = !loading && count > 0
                const params = query(pick)
                params.set('kind', kind)
                return (
                  <Button key={kind} variant="outline" asChild={enabled} disabled={!enabled}>
                    {enabled ? (
                      <a href={`/api/misa-export/cash?${params.toString()}`}>{label}</a>
                    ) : (
                      <span>{label}</span>
                    )}
                  </Button>
                )
              })}
            </div>
            <p className="text-muted-foreground text-xs">{vi.misaExport.rangeDatesHint}</p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
