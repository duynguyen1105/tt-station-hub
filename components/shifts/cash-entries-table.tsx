'use client'

import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSaveAction } from '@/hooks/use-save-action'
import { formatVND } from '@/lib/format'
import {
  type CashEntryInput,
  cashEntryTotals,
  isBlankCashEntry,
  refuseCashEntries,
} from '@/lib/shifts/cash-entries'
import { vi } from '@/messages/vi'

const t = vi.shifts.cashEntries

function emptyEntry(): CashEntryInput {
  return { content: '', counterparty: '', receipt: '', payment: '' }
}

/** Formats a stored amount string for the read-only table; an empty cell stays empty. */
function amountText(value: string): string {
  return value === '' ? '' : formatVND(value)
}

/**
 * Thu chi tiền mặt – Khách CK: the kế toán's hand-typed cash in/out note on a ca, typed
 * row by row and saved as a whole with Lưu. Nothing else on the ca reads it.
 */
export function CashEntriesTable({
  shiftId,
  initialEntries,
  canEdit,
}: {
  shiftId: string
  initialEntries: CashEntryInput[]
  canEdit: boolean
}) {
  const [entries, setEntries] = useState<CashEntryInput[]>(() =>
    initialEntries.length > 0 ? initialEntries : [emptyEntry(), emptyEntry(), emptyEntry()]
  )
  const { busy, save } = useSaveAction()
  const totals = cashEntryTotals(entries)

  function update(index: number, key: keyof CashEntryInput, value: string) {
    setEntries((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)))
  }

  function handleSave() {
    const refusal = refuseCashEntries(entries)
    if (refusal) {
      toast.error(refusal)
      return
    }
    save(`/api/shifts/${shiftId}/cash-entries`, { body: { entries }, success: t.saved })
  }

  const visible = canEdit ? entries : entries.filter((row) => !isBlankCashEntry(row))

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{t.title}</h3>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEntries((prev) => [...prev, emptyEntry()])}
            >
              <Plus className="h-4 w-4" />
              {t.addRow}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={busy}>
              {t.save}
            </Button>
          </div>
        )}
      </div>
      {visible.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="p-2">{t.content}</th>
                <th className="p-2">{t.counterparty}</th>
                <th className="w-44 p-2 text-right">{t.receipt}</th>
                <th className="w-44 p-2 text-right">{t.payment}</th>
                {canEdit && <th className="w-10 p-2"></th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, index) =>
                canEdit ? (
                  <tr key={index} className="border-b">
                    <td className="p-1">
                      <Input
                        value={row.content}
                        onChange={(e) => update(index, 'content', e.target.value)}
                      />
                    </td>
                    <td className="p-1">
                      <Input
                        value={row.counterparty}
                        onChange={(e) => update(index, 'counterparty', e.target.value)}
                      />
                    </td>
                    <td className="p-1">
                      <Input
                        className="text-right font-mono"
                        inputMode="numeric"
                        value={row.receipt}
                        onChange={(e) => update(index, 'receipt', e.target.value)}
                      />
                    </td>
                    <td className="p-1">
                      <Input
                        className="text-right font-mono"
                        inputMode="numeric"
                        value={row.payment}
                        onChange={(e) => update(index, 'payment', e.target.value)}
                      />
                    </td>
                    <td className="p-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t.removeRow}
                        title={t.removeRow}
                        onClick={() => setEntries((prev) => prev.filter((_, i) => i !== index))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ) : (
                  <tr key={index} className="border-b">
                    <td className="p-2">{row.content}</td>
                    <td className="p-2">{row.counterparty}</td>
                    <td className="p-2 text-right font-mono">{amountText(row.receipt)}</td>
                    <td className="p-2 text-right font-mono">{amountText(row.payment)}</td>
                  </tr>
                )
              )}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="p-2 text-center" colSpan={2}>
                  {t.total}
                </td>
                <td className="p-2 text-right font-mono">{formatVND(totals.receipt)}</td>
                <td className="p-2 text-right font-mono">{formatVND(totals.payment)}</td>
                {canEdit && <td></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}
