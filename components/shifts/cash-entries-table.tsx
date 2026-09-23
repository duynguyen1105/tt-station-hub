'use client'

import { Check, ChevronsUpDown, Plus, X } from 'lucide-react'
import { toast } from 'sonner'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useSaveAction } from '@/hooks/use-save-action'
import { formatVND } from '@/lib/format'
import {
  type CashEntryInput,
  cashEntryTotals,
  isBlankCashEntry,
  refuseCashEntries,
} from '@/lib/shifts/cash-entries'
import { cn } from '@/lib/utils'
import { vi } from '@/messages/vi'

const t = vi.shifts.cashEntries

type Customer = { id: string; name: string }

function emptyEntry(): CashEntryInput {
  return { content: '', customerId: null, counterparty: '', receipt: '', payment: '' }
}

/** What Đối tượng reads as: the picked khách hàng's tên, else the typed text. */
function counterpartyLabel(row: CashEntryInput, customers: Customer[]): string {
  return row.customerId
    ? (customers.find((c) => c.id === row.customerId)?.name ?? '')
    : row.counterparty
}

/**
 * Đối tượng: a khách hàng from the list, or — when the other side is no customer (the
 * bank of a Nộp tiền row) — the text typed in the search box, kept as written.
 */
function CounterpartyPicker({
  customers,
  row,
  onChange,
}: {
  customers: Customer[]
  row: CashEntryInput
  onChange: (value: Pick<CashEntryInput, 'customerId' | 'counterparty'>) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const label = counterpartyLabel(row, customers)
  const typed = search.trim()
  const typedIsCustomer = customers.some((c) => c.name.toLowerCase() === typed.toLowerCase())

  function pick(value: Pick<CashEntryInput, 'customerId' | 'counterparty'>) {
    onChange(value)
    setOpen(false)
    setSearch('')
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setSearch('')
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          title={label || undefined}
          className="w-full min-w-0 justify-between font-normal"
        >
          {label ? (
            <span className="truncate">{label}</span>
          ) : (
            <span className="text-muted-foreground truncate">{t.pickCounterparty}</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={vi.debtReview.searchCustomer}
          />
          <CommandList>
            <CommandEmpty>{vi.debtReview.noCustomerFound}</CommandEmpty>
            {!typed && label && (
              <CommandGroup>
                <CommandItem
                  value="__clear__"
                  onSelect={() => pick({ customerId: null, counterparty: '' })}
                >
                  {t.clearCounterparty}
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {customers.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.name}
                  onSelect={() => pick({ customerId: c.id, counterparty: '' })}
                >
                  <Check
                    className={cn(
                      'mr-2 size-4',
                      row.customerId === c.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
            {typed && !typedIsCustomer && (
              <CommandGroup>
                <CommandItem
                  value={`__typed__ ${typed}`}
                  onSelect={() => pick({ customerId: null, counterparty: typed })}
                >
                  {t.useTyped(typed)}
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Formats a stored amount string for the read-only table; an empty cell stays empty. */
function amountText(value: string): string {
  return value === '' ? '' : formatVND(value)
}

/**
 * Thu chi tiền mặt – Khách CK: the kế toán's hand-typed cash in/out table on a ca, typed
 * row by row and saved as a whole with Lưu. A Thu row naming a khách hàng is that khách's
 * thu nợ in the sổ công nợ; every other row is a note.
 */
export function CashEntriesTable({
  shiftId,
  initialEntries,
  customers,
  canEdit,
}: {
  shiftId: string
  initialEntries: CashEntryInput[]
  customers: Customer[]
  canEdit: boolean
}) {
  const [entries, setEntries] = useState<CashEntryInput[]>(() =>
    initialEntries.length > 0 ? initialEntries : [emptyEntry(), emptyEntry(), emptyEntry()]
  )
  const { busy, save } = useSaveAction()
  const totals = cashEntryTotals(entries)

  function update(index: number, patch: Partial<CashEntryInput>) {
    setEntries((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
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
        <div>
          <h3 className="text-base font-semibold">{t.title}</h3>
          <p className="text-muted-foreground text-xs">{t.debtHint}</p>
        </div>
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
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="p-2">{t.content}</th>
                <th className="p-2">{t.counterparty}</th>
                <th className="w-44 p-2 text-right">{t.receipt}</th>
                <th className="w-44 p-2 text-right">{t.payment}</th>
                {canEdit && <th className="w-12 p-2"></th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, index) =>
                canEdit ? (
                  <tr key={index} className="border-b">
                    <td className="p-1">
                      <Input
                        value={row.content}
                        onChange={(e) => update(index, { content: e.target.value })}
                      />
                    </td>
                    <td className="p-1">
                      <CounterpartyPicker
                        customers={customers}
                        row={row}
                        onChange={(value) => update(index, value)}
                      />
                    </td>
                    <td className="p-1">
                      <Input
                        className="text-right font-mono"
                        inputMode="numeric"
                        value={row.receipt}
                        onChange={(e) => update(index, { receipt: e.target.value })}
                      />
                    </td>
                    <td className="p-1">
                      <Input
                        className="text-right font-mono"
                        inputMode="numeric"
                        value={row.payment}
                        onChange={(e) => update(index, { payment: e.target.value })}
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
                    <td className="p-2">{counterpartyLabel(row, customers)}</td>
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
