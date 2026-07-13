'use client'

import { useState } from 'react'

import Link from 'next/link'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { formatLiters } from '@/lib/format'
import type {
  FuelSummary,
  PreflightError,
  PreflightWarning,
} from '@/lib/misa-export/build-sales-voucher'
import { cn } from '@/lib/utils'
import { vi } from '@/messages/vi'

type PreflightResult = {
  fuelSummary: FuelSummary[]
  errors: PreflightError[]
  warnings: PreflightWarning[]
}

/** The Settings screen that fixes each blocking error, given the station. */
function fixLink(error: PreflightError, stationId: string): string {
  switch (error.code) {
    case 'missing_station_config':
      return `/settings/misa/config?station=${stationId}`
    case 'missing_fuel_map':
      return `/settings/misa/fuel-map?station=${stationId}`
    case 'missing_price':
      return `/settings/misa/prices?station=${stationId}`
    case 'customer_without_misa_code':
      return `/stations/${stationId}/debts`
    case 'visit_without_fuel_type':
      return `/review/debts`
  }
}

function fuelLabel(fuelType: string): string {
  return vi.fuelType[fuelType as keyof typeof vi.fuelType] ?? fuelType
}

export function ExportPreflightDialog({
  shiftId,
  stationId,
  shiftDate,
}: {
  shiftId: string
  stationId: string
  shiftDate: string // yyyy-MM-dd — default for the voucher dates
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [result, setResult] = useState<PreflightResult | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [postingDate, setPostingDate] = useState(shiftDate)
  const [voucherDate, setVoucherDate] = useState(shiftDate)
  const [invoiceDate, setInvoiceDate] = useState(shiftDate)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next || result !== null || loading) return
    setLoading(true)
    setLoadError(false)
    fetch(`/api/shifts/${shiftId}/export-misa?preflight=1`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: PreflightResult) => setResult(data))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }

  const hasErrors = (result?.errors.length ?? 0) > 0
  const hasWarnings = (result?.warnings.length ?? 0) > 0
  const datesFilled = postingDate !== '' && voucherDate !== ''
  const downloadParams = new URLSearchParams({ postingDate, voucherDate, invoiceDate })
  if (hasWarnings) downloadParams.set('confirm', '1')
  const downloadUrl = `/api/shifts/${shiftId}/export-misa?${downloadParams.toString()}`
  const canDownload = result !== null && !hasErrors && datesFilled && (!hasWarnings || confirmed)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {vi.misaExport.action}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{vi.misaExport.title}</DialogTitle>
        </DialogHeader>

        {loading && <p className="text-muted-foreground text-sm">{vi.misaExport.loading}</p>}
        {loadError && <p className="text-destructive text-sm">{vi.misaExport.loadError}</p>}

        {result !== null && !loading && (
          <div className="space-y-4">
            <section className="space-y-2">
              <h3 className="text-sm font-medium">{vi.misaExport.fuelMathTitle}</h3>
              {result.fuelSummary.length === 0 ? (
                <p className="text-muted-foreground text-sm">{vi.misaExport.noFuelData}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b text-left">
                      <th className="p-2">{vi.misaExport.fuel}</th>
                      <th className="p-2 text-right">{vi.misaExport.metered}</th>
                      <th className="p-2 text-right">{vi.misaExport.credit}</th>
                      <th className="p-2 text-right">{vi.misaExport.cash}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.fuelSummary.map((f) => (
                      <tr key={f.fuelType} className="border-b">
                        <td className="p-2">{fuelLabel(f.fuelType)}</td>
                        <td className="p-2 text-right font-mono">
                          {formatLiters(f.meteredLiters)}
                        </td>
                        <td className="p-2 text-right font-mono">{formatLiters(f.creditLiters)}</td>
                        <td
                          className={cn(
                            'p-2 text-right font-mono',
                            f.cashLiters < 0 && 'text-destructive font-medium'
                          )}
                        >
                          {formatLiters(f.cashLiters)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {hasErrors && (
              <section className="space-y-2">
                <h3 className="text-destructive text-sm font-medium">
                  {vi.misaExport.fixListTitle}
                </h3>
                <ul className="space-y-2">
                  {result.errors.map((error, i) => (
                    <li
                      key={i}
                      className="flex items-start justify-between gap-3 rounded-md border p-2 text-sm"
                    >
                      <div>
                        <p className="font-medium">{vi.misaExport.errorCodes[error.code]}</p>
                        <p className="text-muted-foreground">{error.message}</p>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link href={fixLink(error, stationId)}>{vi.misaExport.fix}</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {!hasErrors && hasWarnings && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">{vi.misaExport.warningTitle}</h3>
                <ul className="text-muted-foreground space-y-1 text-sm">
                  {result.warnings.map((warning: PreflightWarning, i) => (
                    <li key={i}>{warning.message}</li>
                  ))}
                </ul>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  {vi.misaExport.negativeCashConfirm}
                </label>
              </section>
            )}

            {!hasErrors && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">{vi.misaExport.datesTitle}</h3>
                <div className="grid grid-cols-3 gap-3">
                  <Field>
                    <FieldLabel htmlFor="postingDate">{vi.misaExport.postingDate}</FieldLabel>
                    <Input
                      id="postingDate"
                      type="date"
                      value={postingDate}
                      onChange={(e) => setPostingDate(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="voucherDate">{vi.misaExport.voucherDate}</FieldLabel>
                    <Input
                      id="voucherDate"
                      type="date"
                      value={voucherDate}
                      onChange={(e) => setVoucherDate(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="invoiceDate">{vi.misaExport.invoiceDate}</FieldLabel>
                    <Input
                      id="invoiceDate"
                      type="date"
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                    />
                  </Field>
                </div>
              </section>
            )}

            {!hasErrors && (
              <div className="flex justify-end">
                <Button asChild={canDownload} disabled={!canDownload}>
                  {canDownload ? (
                    <a href={downloadUrl}>{vi.misaExport.download}</a>
                  ) : (
                    <span>{vi.misaExport.download}</span>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
