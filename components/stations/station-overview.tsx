import {
  AlertTriangle,
  CalendarX,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileWarning,
  Fuel,
  Gauge,
  HandCoins,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'

import Link from 'next/link'

import { StatusBadge } from '@/components/shared/status-badge'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate, formatLiters, formatVND } from '@/lib/format'
import {
  customerHref,
  importReceiptHref,
  shiftHref,
  stationHref,
  stationSlug,
} from '@/lib/stations/href'
import {
  CHART_DAYS,
  LOW_COVER_DAYS,
  type OverviewShift,
  type StationOverview,
} from '@/lib/stations/load-overview'
import { relativeChange } from '@/lib/stations/overview'
import { shiftStatusInfo } from '@/lib/ui/status'
import { cn } from '@/lib/utils'
import { vi } from '@/messages/vi'

const t = vi.stationOverview

/**
 * One colour per nhiên liệu, the same in the chart, its legend and the bảng. The theme's
 * teal and brass lead; the theme's other chart tones are too close to them to tell a
 * stacked bar apart, so the rest are plain hues.
 */
const FUEL_COLORS = ['bg-chart-1', 'bg-chart-2', 'bg-sky-500', 'bg-rose-400', 'bg-violet-500']

/** A YYYY-MM-DD ngày as dd/MM, or dd/MM/yyyy with `year`. */
function dayLabel(day: string, year = false): string {
  const short = `${day.slice(8, 10)}/${day.slice(5, 7)}`
  return year ? `${short}/${day.slice(0, 4)}` : short
}

const liters0 = (value: number) => formatLiters(value, 0)

type Tone = 'danger' | 'warning' | 'info'

const TONE_STYLES: Record<Tone, string> = {
  danger: 'text-rose-600 dark:text-rose-400',
  warning: 'text-amber-600 dark:text-amber-400',
  info: 'text-sky-600 dark:text-sky-400',
}

type AttentionItem = {
  key: string
  tone: Tone
  icon: typeof AlertTriangle
  text: string
  hint?: string
  href: string
}

/** Everything left undone at this trạm, worst first, each a link to where it is done. */
export function AttentionPanel({
  code,
  data,
  fuelLabel,
}: {
  code: string
  data: StationOverview
  fuelLabel: (fuelType: string) => string
}) {
  const base = stationHref(code)
  const slug = stationSlug(code)
  const items: AttentionItem[] = []

  for (const doc of data.documents.attention) {
    items.push({
      key: `doc-${doc.name}-${doc.expiry.toISOString()}`,
      tone: doc.daysLeft < 0 ? 'danger' : 'warning',
      icon: FileWarning,
      text:
        doc.daysLeft < 0
          ? t.expiredDoc(doc.name, formatDate(doc.expiry))
          : t.expiringDoc(doc.name, doc.daysLeft),
      href: `${base}/documents`,
    })
  }
  for (const s of data.stock) {
    const label = fuelLabel(s.fuelType)
    if (s.bookStock < 0) {
      items.push({
        key: `neg-${s.fuelType}`,
        tone: 'danger',
        icon: Fuel,
        text: t.negativeStock(label),
        href: `${base}/inventory`,
      })
    } else if (s.lowThreshold !== null && s.bookStock <= s.lowThreshold) {
      items.push({
        key: `low-${s.fuelType}`,
        tone: 'danger',
        icon: Fuel,
        text: t.lowStock(label),
        href: `${base}/inventory`,
      })
    } else if (s.cover !== null && s.cover < LOW_COVER_DAYS) {
      items.push({
        key: `cover-${s.fuelType}`,
        tone: 'warning',
        icon: Fuel,
        text: t.lowCover(label, s.cover.toFixed(1)),
        href: `${base}/inventory`,
      })
    }
    if (!s.hasOpening) {
      items.push({
        key: `opening-${s.fuelType}`,
        tone: 'info',
        icon: Fuel,
        text: t.noOpening(label),
        href: `${base}/inventory`,
      })
    }
  }
  // One ca opens straight onto its phiếu; several open the Chốt ca list narrowed to them.
  const [oldestUnclosed, ...laterUnclosed] = data.unclosedShifts
  if (oldestUnclosed) {
    items.push({
      key: 'unclosed',
      tone: 'warning',
      icon: ClipboardCheck,
      text: t.unclosedShifts(data.unclosedShifts.length),
      hint: listDays(data.unclosedShifts),
      href:
        laterUnclosed.length === 0
          ? shiftHref(code, oldestUnclosed)
          : `${base}/shifts?status=open,collecting_photos,ai_processing,pending_review`,
    })
  }
  if (data.pending.readings) {
    items.push({
      key: 'readings',
      tone: 'warning',
      icon: Gauge,
      text: t.pendingReadings(data.pending.readings),
      href: `/review/shifts?station=${slug}`,
    })
  }
  if (data.pending.visits) {
    items.push({
      key: 'visits',
      tone: 'warning',
      icon: HandCoins,
      text: t.pendingVisits(data.pending.visits),
      href: `/review/debts?station=${slug}`,
    })
  }
  if (data.pending.dips) {
    items.push({
      key: 'dips',
      tone: 'warning',
      icon: Gauge,
      text: t.pendingDips(data.pending.dips),
      href: `${base}/inventory?tab=dips&status=pending`,
    })
  }
  if (data.missingDays.length) {
    items.push({
      key: 'missing',
      tone: 'warning',
      icon: CalendarX,
      text: t.missingDays(data.missingDays.length),
      hint: `${listDays(data.missingDays)} — ${t.missingDaysHint}`,
      href: `${base}/shifts`,
    })
  }
  if (data.documents.total === 0) {
    items.push({
      key: 'no-docs',
      tone: 'info',
      icon: FileWarning,
      text: t.noDocuments,
      href: `${base}/documents`,
    })
  }

  const order: Record<Tone, number> = { danger: 0, warning: 1, info: 2 }
  items.sort((a, b) => order[a.tone] - order[b.tone])

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="font-semibold">{t.attention}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-4 shrink-0" />
            {t.allClear}
          </p>
        ) : (
          <ul className="divide-y">
            {items.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="hover:bg-muted/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-2"
                >
                  <item.icon className={cn('size-4 shrink-0', TONE_STYLES[item.tone])} />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{item.text}</span>
                    {item.hint && (
                      <span className="text-muted-foreground block text-xs">{item.hint}</span>
                    )}
                  </span>
                  <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/** Up to five ngày as dd/MM, then how many more. */
function listDays(days: string[]): string {
  const shown = days
    .slice(0, 5)
    .map((day) => dayLabel(day))
    .join(', ')
  return days.length > 5 ? `${shown} ${t.more(days.length - 5)}` : shown
}

function Change({
  current,
  previous,
  label,
}: {
  current: number
  previous: number
  label: string
}) {
  const change = relativeChange(current, previous)
  if (change === null) return <p className="text-muted-foreground text-xs">{t.noComparison}</p>
  const up = change >= 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <p className="text-muted-foreground flex items-center gap-1 text-xs">
      <span
        className={cn(
          'inline-flex items-center gap-0.5 font-semibold',
          up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
        )}
      >
        <Icon className="size-3.5" />
        {up ? '+' : ''}
        {(change * 100).toFixed(1)}%
      </span>
      {label}
    </p>
  )
}

function Kpi({
  title,
  action,
  value,
  children,
}: {
  title: string
  action?: React.ReactNode
  value: string
  children?: React.ReactNode
}) {
  return (
    <Card size="sm" className="relative">
      <span className="bg-brass absolute inset-x-0 top-0 h-1" />
      <CardHeader>
        <CardTitle className="label-micro">{title}</CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="readout text-2xl font-bold whitespace-nowrap">{value}</p>
        {children}
      </CardContent>
    </Card>
  )
}

/** The four headline figures: the latest ca, the week, the month, and the cash in hand. */
export function SalesKpis({ code, data }: { code: string; data: StationOverview }) {
  const { sales, latestShift, cash } = data
  const status = latestShift ? shiftStatusInfo(latestShift.status) : null
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi
        title={t.latestShift}
        action={status && <StatusBadge label={status.label} tone={status.tone} />}
        value={latestShift?.sales ? formatVND(latestShift.sales.amount) : '—'}
      >
        {latestShift ? (
          <>
            <p className="text-muted-foreground text-xs">
              {dayLabel(latestShift.day, true)} ·{' '}
              {t.liters(liters0(latestShift.sales?.liters ?? 0))}
            </p>
            <Link
              href={shiftHref(code, latestShift.day)}
              className="text-primary text-xs font-medium hover:underline"
            >
              {t.go}
            </Link>
          </>
        ) : (
          <p className="text-muted-foreground text-xs">{t.noShift}</p>
        )}
      </Kpi>
      <Kpi title={t.week} value={formatVND(sales.week.amount)}>
        <p className="text-muted-foreground text-xs">{t.liters(liters0(sales.week.liters))}</p>
        <Change current={sales.week.amount} previous={sales.previousWeek.amount} label={t.vsWeek} />
      </Kpi>
      <Kpi title={t.month} value={formatVND(sales.month.amount)}>
        <p className="text-muted-foreground text-xs">{t.liters(liters0(sales.month.liters))}</p>
        <Change
          current={sales.month.amount}
          previous={sales.previousMonth.amount}
          label={t.vsMonth}
        />
      </Kpi>
      <Kpi
        title={t.cash}
        value={cash?.view.kind === 'line' ? formatVND(cash.view.line.closing) : '—'}
      >
        <p className="text-muted-foreground text-xs">
          {!cash
            ? t.noShift
            : cash.view.kind === 'line'
              ? t.cashAsOf(dayLabel(cash.day, true))
              : cash.view.kind === 'before-opening'
                ? t.cashBeforeOpening(formatDate(cash.view.effectiveDate))
                : t.cashNoOpening}
        </p>
      </Kpi>
    </div>
  )
}

/** The fuels sold this month, in a fixed order, so each keeps its colour everywhere. */
export function fuelOrder(data: StationOverview): string[] {
  const fuels = new Set<string>()
  for (const s of data.stock) fuels.add(s.fuelType)
  for (const day of data.sales.chart)
    for (const fuel of day.total?.byFuel.keys() ?? []) fuels.add(fuel)
  return [...fuels].sort()
}

/** Doanh thu a ngày over the last CHART_DAYS ngày, stacked by nhiên liệu. */
export function SalesChart({
  data,
  fuels,
  fuelLabel,
}: {
  data: StationOverview
  fuels: string[]
  fuelLabel: (fuelType: string) => string
}) {
  const { chart } = data.sales
  const { firstDay } = data
  const peak = Math.max(0, ...chart.map((d) => d.total?.amount ?? 0))
  const hasShift = chart.some((d) => d.total !== null)
  // A ngày with no ca before the trạm's first one is not a gap — it was not on the app yet.
  const afterStart = (day: string) => firstDay !== null && day >= firstDay
  const hasGap = chart.some((d) => d.total === null && afterStart(d.day))
  const unpriced = chart.reduce((sum, d) => sum + (d.total?.unpricedLiters ?? 0), 0)
  return (
    <Card size="sm" className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="font-semibold">{t.chartTitle}</CardTitle>
        {peak > 0 && (
          <CardAction className="text-muted-foreground text-xs">
            {t.chartPeak(formatVND(peak))}
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasShift ? (
          <p className="text-muted-foreground">{t.chartEmpty}</p>
        ) : (
          <>
            <div
              className="flex h-44 items-end gap-0.5 border-b"
              role="img"
              aria-label={t.chartTitle}
            >
              {chart.map(({ day, total }) => {
                const tip = total
                  ? `${dayLabel(day, true)}: ${formatVND(total.amount)} · ${liters0(total.liters)} L`
                  : `${dayLabel(day, true)}: ${t.chartNoShift}`
                if (!total) {
                  return afterStart(day) ? (
                    <div
                      key={day}
                      title={tip}
                      className="border-muted-foreground/30 h-2 flex-1 rounded-t-sm border border-dashed"
                    />
                  ) : (
                    <div key={day} className="flex-1" />
                  )
                }
                return (
                  <div key={day} title={tip} className="group flex h-full flex-1 flex-col-reverse">
                    {fuels.map((fuel, i) => {
                      const amount = total.byFuel.get(fuel)?.amount ?? 0
                      if (!amount || !peak) return null
                      return (
                        <div
                          key={fuel}
                          className={cn(
                            FUEL_COLORS[i % FUEL_COLORS.length],
                            'w-full group-hover:opacity-80 first:rounded-b-none last:rounded-t-sm'
                          )}
                          style={{ height: `${(amount / peak) * 100}%` }}
                        />
                      )
                    })}
                  </div>
                )
              })}
            </div>
            <div className="text-muted-foreground flex justify-between text-xs">
              {chart
                .filter((_, i) => i % 5 === 0 || i === CHART_DAYS - 1)
                .map(({ day }) => (
                  <span key={day}>{dayLabel(day)}</span>
                ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {fuels.map((fuel, i) => (
                <span key={fuel} className="inline-flex items-center gap-1.5">
                  <span
                    className={cn('size-2.5 rounded-sm', FUEL_COLORS[i % FUEL_COLORS.length])}
                  />
                  {fuelLabel(fuel)}
                </span>
              ))}
              {hasGap && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="border-muted-foreground/50 size-2.5 rounded-sm border border-dashed" />
                  {t.chartNoShift}
                </span>
              )}
            </div>
            {unpriced > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {t.unpriced(liters0(unpriced))}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** This month's lít and doanh thu per nhiên liệu, with the giá bán lẻ in force today. */
export function FuelMix({
  data,
  fuels,
  fuelLabel,
}: {
  data: StationOverview
  fuels: string[]
  fuelLabel: (fuelType: string) => string
}) {
  const { month, priceToday } = data.sales
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="font-semibold">{t.fuelMixTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        {month.liters === 0 ? (
          <p className="text-muted-foreground">{t.fuelMixEmpty}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs">
                <th className="py-1.5 font-medium">{t.fuel}</th>
                <th className="py-1.5 text-right font-medium">{t.soldLiters}</th>
                <th className="py-1.5 text-right font-medium">{t.revenue}</th>
              </tr>
            </thead>
            <tbody>
              {fuels.map((fuel, i) => {
                const sold = month.byFuel.get(fuel)
                const price = priceToday.get(fuel)
                return (
                  <tr key={fuel} className="border-b">
                    <td className="py-2">
                      <span className="flex items-center gap-1.5 font-medium">
                        <span
                          className={cn('size-2.5 rounded-sm', FUEL_COLORS[i % FUEL_COLORS.length])}
                        />
                        {fuelLabel(fuel)}
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        {t.priceToday}: {price === undefined ? '—' : formatVND(price)}
                      </span>
                    </td>
                    <td className="readout py-2 text-right align-middle">
                      {liters0(sold?.liters ?? 0)}
                      <span className="text-muted-foreground block text-xs">
                        {(((sold?.liters ?? 0) / month.liters) * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="readout py-2 text-right align-middle">
                      {formatVND(sold?.amount ?? 0)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="pt-2">{t.total}</td>
                <td className="readout pt-2 text-right">{liters0(month.liters)}</td>
                <td className="readout pt-2 text-right">{formatVND(month.amount)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </CardContent>
    </Card>
  )
}

function SectionLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="text-primary text-xs font-medium whitespace-nowrap hover:underline"
    >
      {t.viewAll}
    </Link>
  )
}

/** Each nhiên liệu's tồn sổ sách against its hầm, and how many ngày it lasts. */
export function StockPanel({
  code,
  data,
  fuels,
  fuelLabel,
}: {
  code: string
  data: StationOverview
  fuels: string[]
  fuelLabel: (fuelType: string) => string
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="font-semibold">{t.stockTitle}</CardTitle>
        <CardAction>
          <SectionLink href={`${stationHref(code)}/inventory`} />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.stock.length === 0 && <p className="text-muted-foreground">{t.stockEmpty}</p>}
        {data.stock.map((s) => {
          const fill = s.capacity
            ? Math.min(100, Math.max(0, (s.bookStock / s.capacity) * 100))
            : null
          const low =
            s.bookStock < 0 ||
            (s.lowThreshold !== null && s.bookStock <= s.lowThreshold) ||
            (s.cover !== null && s.cover < LOW_COVER_DAYS)
          const colour = FUEL_COLORS[fuels.indexOf(s.fuelType) % FUEL_COLORS.length]
          return (
            <div key={s.fuelType} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex items-center gap-1.5 font-medium">
                  <span className={cn('size-2.5 rounded-sm', colour)} />
                  {fuelLabel(s.fuelType)}
                </span>
                <span
                  className={cn(
                    'readout text-base font-semibold',
                    low && 'text-rose-600 dark:text-rose-400'
                  )}
                >
                  {liters0(s.bookStock)} L
                </span>
              </div>
              {fill !== null && (
                <div className="bg-muted h-2 overflow-hidden rounded-full">
                  <div
                    className={cn('h-full rounded-full', low ? 'bg-rose-500' : colour)}
                    style={{ width: `${fill}%` }}
                  />
                </div>
              )}
              <div className="text-muted-foreground flex flex-wrap justify-between gap-x-3 text-xs">
                <span>{s.capacity ? t.capacity(fill!.toFixed(0), liters0(s.capacity)) : null}</span>
                <span>
                  {s.dailyRate > 0
                    ? `${t.dailyRate(liters0(s.dailyRate))}${s.cover !== null ? ` · ${t.cover(s.cover.toFixed(1))}` : ''}`
                    : t.noRate}
                </span>
              </div>
              <p className="text-muted-foreground text-xs">
                {s.lastImport
                  ? t.lastImport(formatDate(s.lastImport.at), liters0(s.lastImport.liters))
                  : t.noImport}
              </p>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

/** Dư nợ, this month's movement on the sổ, and who owes the most. */
export function DebtPanel({ code, data }: { code: string; data: StationOverview }) {
  const { debt } = data
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="font-semibold">{t.debtTitle}</CardTitle>
        <CardAction>
          <SectionLink href={`${stationHref(code)}/debts`} />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="label-micro">{vi.overview.totalDebt}</p>
          <p className="readout text-2xl font-bold">{formatVND(debt.total)}</p>
          <p className="text-muted-foreground text-xs">{t.owingCount(debt.owingCount)}</p>
        </div>
        <dl className="grid gap-2 sm:grid-cols-3">
          {[
            { label: t.monthCharged, value: debt.month.charged, sign: '+' },
            { label: t.monthAdvanced, value: debt.month.advanced, sign: '+' },
            { label: t.monthPaid, value: debt.month.paid, sign: '−' },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border p-2">
              <dt className="text-muted-foreground text-xs">{item.label}</dt>
              <dd className="readout text-sm font-semibold whitespace-nowrap">
                {item.value ? `${item.sign}${formatVND(item.value)}` : formatVND(0)}
              </dd>
            </div>
          ))}
        </dl>
        <div>
          <p className="label-micro mb-1">{t.topDebtors}</p>
          {debt.top.length === 0 ? (
            <p className="text-muted-foreground">{t.noDebt}</p>
          ) : (
            <ul className="divide-y">
              {debt.top.map((d) => {
                const share = debt.total > 0 ? (d.balance / debt.total) * 100 : 0
                return (
                  <li key={`${d.no}-${d.name}`} className="space-y-1 py-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      {d.no !== null ? (
                        <Link
                          href={customerHref(code, d.no)}
                          className="text-primary truncate font-medium hover:underline"
                        >
                          {d.name}
                        </Link>
                      ) : (
                        <span className="truncate font-medium">{d.name}</span>
                      )}
                      <span className="readout whitespace-nowrap">{formatVND(d.balance)}</span>
                    </div>
                    <div className="bg-muted h-1 overflow-hidden rounded-full">
                      <div
                        className="bg-brass h-full rounded-full"
                        style={{ width: `${Math.min(100, share)}%` }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** The last few ca, each with what it sold, linking to its phiếu chốt ca. */
export function RecentShifts({ code, shifts }: { code: string; shifts: OverviewShift[] }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="font-semibold">{t.recentShifts}</CardTitle>
        <CardAction>
          <SectionLink href={`${stationHref(code)}/shifts`} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {shifts.length === 0 ? (
          <p className="text-muted-foreground">{t.noShift}</p>
        ) : (
          <ul className="divide-y">
            {shifts.map((s) => {
              const status = shiftStatusInfo(s.status)
              return (
                <li key={s.day}>
                  <Link
                    href={shiftHref(code, s.day)}
                    className="hover:bg-muted/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-2"
                  >
                    <span className="readout w-24 shrink-0">{dayLabel(s.day, true)}</span>
                    <span className="flex-1">
                      <StatusBadge label={status.label} tone={status.tone} />
                    </span>
                    <span className="readout text-right">
                      {s.sales ? formatVND(s.sales.amount) : '—'}
                      {s.sales && (
                        <span className="text-muted-foreground block text-xs">
                          {liters0(s.sales.liters)} L
                        </span>
                      )}
                    </span>
                    <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/** The last biên bản nhập hàng, with the litres each booked per nhiên liệu. */
export function RecentReceipts({
  code,
  data,
  fuelLabel,
}: {
  code: string
  data: StationOverview
  fuelLabel: (fuelType: string) => string
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="font-semibold">{t.recentReceipts}</CardTitle>
        <CardAction>
          <SectionLink href={`${stationHref(code)}/inventory?tab=imports`} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {data.receipts.length === 0 ? (
          <p className="text-muted-foreground">{t.noReceipts}</p>
        ) : (
          <ul className="divide-y">
            {data.receipts.map((r) => (
              <li key={r.no}>
                <Link
                  href={importReceiptHref(code, r.no)}
                  className="hover:bg-muted/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{t.receiptNo(r.no)}</span>
                    <span className="text-muted-foreground block text-xs">
                      {formatDate(r.date)}
                    </span>
                  </span>
                  <span className="readout text-right text-xs">
                    {r.lines.length === 0
                      ? '—'
                      : r.lines.map((line) => (
                          <span key={line.fuelType} className="block">
                            {fuelLabel(line.fuelType)}: {liters0(line.liters)} L
                          </span>
                        ))}
                  </span>
                  <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
