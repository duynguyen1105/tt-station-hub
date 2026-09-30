'use client'

import { toast } from 'sonner'

import { useState } from 'react'

import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { formatVND } from '@/lib/format'
import type { CashBalanceLine } from '@/lib/shifts/cash-balance'
import { cn } from '@/lib/utils'
import { vi } from '@/messages/vi'

const t = vi.shifts.cashBalance

/**
 * Tồn tiền mặt at the foot of the ca, laid out like the phiếu chốt ca: tiền đầu ngày +
 * tiền bán − chuyển khoản trong ca + thu − chi − nợ = tồn cuối ngày. The numbers are computed on the server
 * (lib/shifts/load-cash-balance.ts); an admin sets the trạm's đầu kỳ here.
 */
export function CashBalanceCard({
  stationId,
  line,
  message,
  openingLabel,
  provisional,
  isAdmin,
  defaultDate,
}: {
  stationId: string
  line: CashBalanceLine | null
  /** Why there is no line (no đầu kỳ yet, or a ca before it). */
  message: string | null
  /** "Đầu kỳ: 3.000.000 đ, từ ngày 27/09/2026", when one is set. */
  openingLabel: string | null
  provisional: boolean
  isAdmin: boolean
  /** YYYY-MM-DD for the đầu kỳ dialog — the ca's ngày. */
  defaultDate: string
}) {
  const rows: { label: string; value: number; tone?: string }[] = line
    ? [
        { label: t.opening, value: line.opening },
        { label: t.sales, value: line.sales },
        // Paid for fuel of this ca, but into the bank — not in the két.
        {
          label: t.transfers,
          value: line.transfers,
          tone: line.transfers > 0 ? 'text-destructive' : undefined,
        },
        { label: t.receipts, value: line.receipts },
        // What leaves the ngăn kéo is marked red — only when something did.
        {
          label: t.payments,
          value: line.payments,
          tone: line.payments > 0 ? 'text-destructive' : undefined,
        },
        {
          label: t.debts,
          value: line.debts,
          tone: line.debts > 0 ? 'text-destructive' : undefined,
        },
      ]
    : []
  return (
    <section className="space-y-2 rounded-lg border p-3 print:break-inside-avoid">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{t.title}</h3>
        {isAdmin && <CashOpeningDialog stationId={stationId} defaultDate={defaultDate} />}
      </div>
      {provisional && line && <p className="text-muted-foreground text-xs">{t.provisional}</p>}
      {message && <p className="text-muted-foreground text-sm">{message}</p>}
      {line && (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b">
                <td className="p-2">{row.label}</td>
                <td className={cn('p-2 text-right font-mono whitespace-nowrap', row.tone)}>
                  {formatVND(row.value)}
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="p-2">{t.closing}</td>
              <td
                className={cn(
                  'p-2 text-right font-mono whitespace-nowrap',
                  line.closing < 0 && 'text-destructive'
                )}
              >
                {formatVND(line.closing)}
              </td>
            </tr>
          </tbody>
        </table>
      )}
      {openingLabel && <p className="text-muted-foreground text-xs">{openingLabel}</p>}
    </section>
  )
}

function CashOpeningDialog({ stationId, defaultDate }: { stationId: string; defaultDate: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [amount, setAmount] = useState('')
  const [effectiveDate, setEffectiveDate] = useState(defaultDate)

  async function save() {
    // Whole đồng, typed with or without thousands dots/commas.
    const cleaned = amount.replace(/[.,\s]/g, '')
    const value = /^\d+$/.test(cleaned) ? Number(cleaned) : NaN
    if (!Number.isSafeInteger(value) || !effectiveDate) {
      toast.error(t.invalidAmount)
      return
    }
    setBusy(true)
    const res = await fetch(`/api/stations/${stationId}/cash-opening`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: value, effectiveDate }),
    })
    setBusy(false)
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      toast.error(data?.error ?? vi.errors.generic)
      return
    }
    toast.success(t.saved)
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {t.editOpening}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.openingTitle}</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">{t.openingNote}</p>
        <div className="grid gap-3">
          <Field>
            <FieldLabel htmlFor="cash-opening-amount">{t.amount}</FieldLabel>
            <Input
              id="cash-opening-amount"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="cash-opening-date">{t.effectiveDate}</FieldLabel>
            <Input
              id="cash-opening-date"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            {vi.common.cancel}
          </Button>
          <Button onClick={save} loading={busy}>
            {vi.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
