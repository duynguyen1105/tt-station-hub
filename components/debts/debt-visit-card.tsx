'use client'

import { Check, ChevronsUpDown } from 'lucide-react'
import { toast } from 'sonner'

import { useState } from 'react'

import { useRouter } from 'next/navigation'

import { CustomerForm } from '@/components/debts/customer-form'
import { StatusBadge } from '@/components/shared/status-badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatLiters, formatVND } from '@/lib/format'
import { anomalyLabel, fuelTypeLabel, reviewStatusInfo } from '@/lib/ui/status'
import { cn } from '@/lib/utils'
import { vi } from '@/messages/vi'

export type DebtVisitCardData = {
  visitId: string
  stationId: string
  reviewStatus: string
  plate: string | null
  zaloCaption: string | null
  liters: string | null
  unitPrice: string | null
  computedAmount: number | null
  displayedAmount: number | null
  amountMatchesDisplay: boolean | null
  fuelType: string | null
  customerId: string | null
  autoMatched: boolean
  anomalyReasons: string[]
  aiConfidence: number | null
  visitTime: string
  vehiclePhotoUrl: string | null
  meterPhotoUrl: string | null
  customers: { id: string; name: string }[]
  // Active stations for the manual station picker (AI routes by the pump plate;
  // the reviewer can override when it couldn't tell or got it wrong).
  stations: { id: string; name: string }[]
}

const UNASSIGNED = '__none__'
const FUEL_TYPES = ['DO', 'E0', 'DC', 'XANG_A95', 'URE'] as const

async function post(url: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

/* eslint-disable @next/next/no-img-element -- signed Supabase URLs expire; next/image adds no value here */
function PhotoThumb({ url, label }: { url: string | null; label: string }) {
  if (!url) {
    return (
      <div className="bg-muted/40 text-muted-foreground flex aspect-4/3 items-center justify-center rounded-lg border border-dashed text-xs">
        {vi.debtReview.noPhoto}
      </div>
    )
  }
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="group focus-visible:ring-ring relative aspect-4/3 overflow-hidden rounded-lg border focus-visible:ring-2 focus-visible:outline-none"
        >
          <img
            src={url}
            alt={label}
            className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
          <span className="label-micro absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-white">
            {label}
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <img src={url} alt={label} className="max-h-[75vh] w-full rounded-lg object-contain" />
      </DialogContent>
    </Dialog>
  )
}
/* eslint-enable @next/next/no-img-element */

function CustomerPicker({
  customers,
  value,
  onChange,
}: {
  customers: { id: string; name: string }[]
  value: string | null
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = customers.find((c) => c.id === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            selected.name
          ) : (
            <span className="text-muted-foreground">{vi.debtReview.assignCustomer}</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align="start">
        <Command>
          <CommandInput placeholder={vi.debtReview.searchCustomer} />
          <CommandList>
            <CommandEmpty>{vi.debtReview.noCustomerFound}</CommandEmpty>
            <CommandGroup>
              {customers.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.name}
                  onSelect={() => {
                    onChange(c.id)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn('mr-2 size-4', value === c.id ? 'opacity-100' : 'opacity-0')}
                  />
                  {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function DebtVisitCard({ data }: { data: DebtVisitCardData }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [customerId, setCustomerId] = useState<string | null>(data.customerId)
  // Local so a customer created inline (walk-in) appears + selects immediately.
  const [customers, setCustomers] = useState(data.customers)
  const [openCorrect, setOpenCorrect] = useState(false)
  const [plate, setPlate] = useState(data.plate ?? '')
  const [liters, setLiters] = useState(data.liters ?? '')
  const [unitPrice, setUnitPrice] = useState(data.unitPrice ?? '')
  const [fuelType, setFuelType] = useState(data.fuelType || UNASSIGNED)
  const [stationId, setStationId] = useState(data.stationId)

  const info = reviewStatusInfo(data.reviewStatus)
  const mismatch = data.amountMatchesDisplay === false
  // Visits whose station could not be identified are parked on the (inactive)
  // UNKNOWN station — it is not in the active list, so the picker shows a
  // placeholder and approval is blocked until a real station is chosen.
  const stationKnown = data.stations.some((s) => s.id === stationId)

  // Moving the visit to another station persists immediately — it changes which
  // station's ledger/shift the charge belongs to, so it must not wait for Duyệt.
  async function changeStation(next: string) {
    const prev = stationId
    setStationId(next)
    setBusy(true)
    const res = await post(`/api/debts/visits/${data.visitId}/correct`, { stationId: next })
    setBusy(false)
    if (res.ok) {
      toast.success(vi.debtReview.stationChanged)
      router.refresh()
    } else {
      setStationId(prev)
      toast.error(vi.errors.generic)
    }
  }

  async function approve() {
    if (!stationKnown) {
      toast.error(vi.debtReview.needStation)
      return
    }
    if (!customerId) {
      toast.error(vi.debtReview.needCustomer)
      return
    }
    setBusy(true)
    const res = await post(`/api/debts/visits/${data.visitId}/approve`, { customerId })
    setBusy(false)
    if (res.ok) router.refresh()
    else toast.error((await res.json().catch(() => null))?.error ?? vi.errors.generic)
  }

  async function reject() {
    setBusy(true)
    const res = await post(`/api/debts/visits/${data.visitId}/reject`)
    setBusy(false)
    if (res.ok) router.refresh()
    else toast.error(vi.errors.generic)
  }

  async function saveCorrection() {
    setBusy(true)
    const res = await post(`/api/debts/visits/${data.visitId}/correct`, {
      plateConfirmed: plate || null,
      litersRead: liters ? Number(liters) : null,
      unitPriceRead: unitPrice ? Number(unitPrice) : null,
      customerId: customerId ?? null,
      fuelType: fuelType === UNASSIGNED ? null : fuelType,
    })
    setBusy(false)
    if (res.ok) {
      setOpenCorrect(false)
      router.refresh()
    } else toast.error(vi.errors.generic)
  }

  return (
    <Card className="relative overflow-hidden">
      <span className="bg-brass absolute inset-x-0 top-0 h-1" />
      <CardContent className="space-y-4 pt-5">
        {/* Plate + status + time */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="label-micro">{vi.debts.plate}</p>
            <p className="readout text-foreground text-xl font-bold tracking-wide">
              {data.plate ?? '—'}
            </p>
          </div>
          <div className="space-y-1 text-right">
            <StatusBadge label={info.label} tone={info.tone} />
            <p className="text-muted-foreground text-xs">{data.visitTime}</p>
          </div>
        </div>

        {/* Station — AI-detected from the pump plate; reviewer can override. */}
        <div className="flex items-center gap-2">
          <span className="label-micro shrink-0">{vi.debtReview.station}</span>
          <Select
            value={stationKnown ? stationId : undefined}
            onValueChange={changeStation}
            disabled={busy}
          >
            <SelectTrigger className="h-8 flex-1">
              <SelectValue placeholder={vi.debtReview.selectStation} />
            </SelectTrigger>
            <SelectContent>
              {data.stations.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!stationKnown && <StatusBadge label={vi.debtReview.stationUnknown} tone="danger" />}
        </div>

        {/* Sender note (Zalo caption) — key context for walk-in/can sales. */}
        {data.zaloCaption && (
          <div className="border-brass/40 bg-brass/10 rounded-lg border px-3 py-2 text-sm">
            <span className="label-micro block">{vi.debtReview.senderNote}</span>
            <span className="text-foreground">💬 {data.zaloCaption}</span>
          </div>
        )}

        {/* Photos */}
        <div className="grid grid-cols-2 gap-2">
          <PhotoThumb url={data.vehiclePhotoUrl} label={vi.debtReview.vehiclePhoto} />
          <PhotoThumb url={data.meterPhotoUrl} label={vi.debtReview.meterPhoto} />
        </div>

        {/* Transaction */}
        <div className="bg-muted/40 space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {data.fuelType && (
                <span className="border-brass/40 bg-brass/10 text-foreground rounded border px-2 py-0.5 text-xs font-semibold">
                  {fuelTypeLabel(data.fuelType)}
                </span>
              )}
              {data.aiConfidence !== null && (
                <span className="text-muted-foreground text-xs">
                  {vi.debtReview.confidence} {data.aiConfidence}%
                </span>
              )}
            </div>
            <span className="readout text-foreground text-2xl font-bold">
              {data.computedAmount !== null ? formatVND(data.computedAmount) : '—'}
            </span>
          </div>
          <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <span className="readout text-foreground">
              {data.liters ? formatLiters(Number(data.liters)) : '—'}
            </span>
            <span>×</span>
            <span className="readout text-foreground">
              {data.unitPrice ? formatVND(Number(data.unitPrice)) : '—'}
            </span>
          </div>
          {data.displayedAmount !== null && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">
                {vi.debtReview.displayedAmount}:{' '}
                <span className="readout text-foreground">{formatVND(data.displayedAmount)}</span>
              </span>
              <StatusBadge
                label={mismatch ? vi.debtReview.amountMismatch : vi.debtReview.amountMatch}
                tone={mismatch ? 'danger' : 'success'}
              />
            </div>
          )}
          {data.anomalyReasons.length > 0 && (
            <div className="text-xs text-amber-700 dark:text-amber-400">
              ⚠ {data.anomalyReasons.map(anomalyLabel).join(', ')}
            </div>
          )}
        </div>

        {/* Customer */}
        <div className="space-y-1">
          {data.autoMatched && customerId === data.customerId && data.customerId && (
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              ✓ {vi.debtReview.autoMatched}
            </p>
          )}
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <CustomerPicker customers={customers} value={customerId} onChange={setCustomerId} />
            </div>
            <CustomerForm
              stationId={data.stationId}
              onSaved={(c) => {
                setCustomers((prev) =>
                  prev.some((x) => x.id === c.id)
                    ? prev
                    : [...prev, c].sort((a, b) => a.name.localeCompare(b.name, 'vi'))
                )
                setCustomerId(c.id)
              }}
              trigger={
                <Button variant="outline" size="icon" title={vi.debtReview.addCustomer}>
                  +
                </Button>
              }
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy} onClick={approve}>
            {vi.common.approve}
          </Button>

          <Dialog open={openCorrect} onOpenChange={setOpenCorrect}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={busy}>
                {vi.common.correct}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{vi.debtReview.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <Field>
                  <FieldLabel htmlFor="plate">{vi.debts.plate}</FieldLabel>
                  <Input id="plate" value={plate} onChange={(e) => setPlate(e.target.value)} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor="liters">{vi.debts.liters}</FieldLabel>
                    <Input
                      id="liters"
                      inputMode="decimal"
                      value={liters}
                      onChange={(e) => setLiters(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="unitPrice">{vi.debts.unitPrice}</FieldLabel>
                    <Input
                      id="unitPrice"
                      inputMode="numeric"
                      value={unitPrice}
                      onChange={(e) => setUnitPrice(e.target.value)}
                    />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="fuelType">{vi.debts.fuelType}</FieldLabel>
                  <Select value={fuelType} onValueChange={setFuelType}>
                    <SelectTrigger id="fuelType">
                      <SelectValue placeholder={vi.debts.fuelType} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>—</SelectItem>
                      {FUEL_TYPES.map((ft) => (
                        <SelectItem key={ft} value={ft}>
                          {fuelTypeLabel(ft)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenCorrect(false)}>
                  {vi.common.cancel}
                </Button>
                <Button onClick={saveCorrection} disabled={busy}>
                  {vi.common.save}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                disabled={busy}
                className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40"
              >
                {vi.common.reject}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{vi.debtReview.rejectConfirmTitle}</AlertDialogTitle>
                <AlertDialogDescription>{vi.debtReview.rejectConfirmBody}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{vi.common.cancel}</AlertDialogCancel>
                <AlertDialogAction onClick={reject}>{vi.common.reject}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  )
}
