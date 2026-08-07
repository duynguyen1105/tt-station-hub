'use client'

import { toast } from 'sonner'

import { type ChangeEvent, useRef, useState } from 'react'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { type BienBanExtraction, parseVnNumber, tankCodeFromLabel } from '@/lib/imports/bien-ban'
import { vi } from '@/messages/vi'

export type TankOption = {
  code: string // "HAM_2"
  label: string // "Hầm 2 — Xăng E0 (13K)"
  fuelType: string | null
}

const fuelOptions = Object.entries(vi.fuelType)

// Every cell is a free-text string while editing (mirrors the paper form);
// numbers are parsed once on confirm.
type ProductCol = {
  productLabel: string
  warehouse: string
  quantityLiters: string
  exportSlipNo: string
  sealNo: string
}
type CompartmentRow = {
  liters: string
  valvePosition: string
  compensationLiters: string
  temperatureC: string
}
type SideCells = { temperatureC: string; heightMm: string; bookLiters: string; baremLiters: string }
type TankRow = {
  tankLabel: string
  tankCode: string
  fuelType: string
  importedLiters: string
  before: SideCells
  after: SideCells
}
type PumpRow = {
  pumpLabel: string
  before: { electronic: string; mechanical: string }
  after: { electronic: string; mechanical: string }
}

const emptySide = (): SideCells => ({
  temperatureC: '',
  heightMm: '',
  bookLiters: '',
  baremLiters: '',
})
const emptyProduct = (): ProductCol => ({
  productLabel: '',
  warehouse: '',
  quantityLiters: '',
  exportSlipNo: '',
  sealNo: '',
})
const emptyPump = (): PumpRow => ({
  pumpLabel: '',
  before: { electronic: '', mechanical: '' },
  after: { electronic: '', mechanical: '' },
})

const cellOf = (value: number | string | null | undefined): string =>
  value === null || value === undefined ? '' : String(value)

function tankRowsFromStation(tanks: TankOption[]): TankRow[] {
  return tanks.map((t) => ({
    tankLabel: t.code.replace('HAM_', 'Hầm '),
    tankCode: t.code,
    fuelType: t.fuelType ?? '',
    importedLiters: '',
    before: emptySide(),
    after: emptySide(),
  }))
}

/** Merges the AI extraction into the form rows (station tanks stay first). */
function applyExtraction(extraction: BienBanExtraction, stationTanks: TankOption[]) {
  const products = extraction.products.map((p) => ({
    productLabel: p.productLabel,
    warehouse: cellOf(p.warehouse),
    quantityLiters: cellOf(p.quantityLiters),
    exportSlipNo: cellOf(p.exportSlipNo),
    sealNo: cellOf(p.sealNo),
  }))

  const compartments: CompartmentRow[] = Array.from({ length: 5 }, () => ({
    liters: '',
    valvePosition: '',
    compensationLiters: '',
    temperatureC: '',
  }))
  for (const c of extraction.compartments) {
    const row = compartments[c.compartmentNo - 1]
    if (!row) continue
    row.liters = cellOf(c.liters)
    row.valvePosition = cellOf(c.valvePosition)
    row.compensationLiters = cellOf(c.compensationLiters)
    row.temperatureC = cellOf(c.temperatureC)
  }

  const tanks = tankRowsFromStation(stationTanks)
  const byCode = new Map(tanks.map((t) => [t.tankCode, t]))
  for (const t of extraction.tanks) {
    const parsedCode = tankCodeFromLabel(t.tankLabel)
    const existing = parsedCode ? byCode.get(parsedCode.code) : undefined
    const sideCells = (side: (typeof t)['before']): SideCells => ({
      temperatureC: cellOf(side.temperatureC),
      heightMm: cellOf(side.heightMm),
      bookLiters: cellOf(side.bookLiters),
      baremLiters: cellOf(side.baremLiters),
    })
    if (existing) {
      existing.tankLabel = t.tankLabel
      existing.before = sideCells(t.before)
      existing.after = sideCells(t.after)
    } else {
      tanks.push({
        tankLabel: t.tankLabel,
        tankCode: parsedCode?.code ?? '',
        fuelType: '',
        importedLiters: '',
        before: sideCells(t.before),
        after: sideCells(t.after),
      })
    }
  }
  // One product + one tank whose level rose → that tank obviously took the load.
  const withQuantity = products.filter((p) => p.quantityLiters !== '')
  const rose = tanks.filter((t) => {
    const before = parseVnNumber(t.before.heightMm)
    const after = parseVnNumber(t.after.heightMm)
    return before !== null && after !== null && after > before
  })
  const onlyProduct = withQuantity.length === 1 ? withQuantity[0] : undefined
  const onlyRisen = rose.length === 1 ? rose[0] : undefined
  if (onlyProduct && onlyRisen && onlyRisen.importedLiters === '') {
    onlyRisen.importedLiters = onlyProduct.quantityLiters
  }

  const pumps = extraction.pumps.map((p) => ({
    pumpLabel: cellOf(p.pumpLabel),
    before: { electronic: cellOf(p.before.electronic), mechanical: cellOf(p.before.mechanical) },
    after: { electronic: cellOf(p.after.electronic), mechanical: cellOf(p.after.mechanical) },
  }))

  return { products, compartments, tanks, pumps }
}

function pumpDiff(before: string, after: string): number | null {
  const b = parseVnNumber(before)
  const a = parseVnNumber(after)
  if (b === null || a === null) return null
  return Math.round((a - b) * 100) / 100
}

const cellClass = 'h-8 px-1.5 font-mono text-xs'

/**
 * "Nhập hàng" wizard mirroring the paper BIÊN BẢN GIAO NHẬN XĂNG DẦU:
 * 1) upload the biên bản photo(s), AI pre-fills the form;
 * 2) review the form section-by-section against the paper and confirm;
 * 3) upload every related photo of the delivery session for later audits.
 */
export function FuelImportForm({ stationId, tanks }: { stationId: string; tanks: TankOption[] }) {
  const router = useRouter()
  const bienBanRef = useRef<HTMLInputElement>(null)
  const relatedRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [busy, setBusy] = useState(false)
  const [bienBanFiles, setBienBanFiles] = useState<File[]>([])
  const [rawExtract, setRawExtract] = useState<BienBanExtraction | null>(null)
  const [receiptId, setReceiptId] = useState<string | null>(null)

  const [importedAt, setImportedAt] = useState('')
  const [staffName, setStaffName] = useState('')
  const [driverName, setDriverName] = useState('')
  const [truckPlate, setTruckPlate] = useState('')
  const [vehicleCheck, setVehicleCheck] = useState('')
  const [note, setNote] = useState('')
  const [products, setProducts] = useState<ProductCol[]>([emptyProduct()])
  const [compartments, setCompartments] = useState<CompartmentRow[]>(
    Array.from({ length: 5 }, () => ({
      liters: '',
      valvePosition: '',
      compensationLiters: '',
      temperatureC: '',
    }))
  )
  const [tankRows, setTankRows] = useState<TankRow[]>(tankRowsFromStation(tanks))
  const [pumps, setPumps] = useState<PumpRow[]>([emptyPump()])

  function reset() {
    setStep(1)
    setBienBanFiles([])
    setRawExtract(null)
    setReceiptId(null)
    setImportedAt('')
    setStaffName('')
    setDriverName('')
    setTruckPlate('')
    setVehicleCheck('')
    setNote('')
    setProducts([emptyProduct()])
    setCompartments(
      Array.from({ length: 5 }, () => ({
        liters: '',
        valvePosition: '',
        compensationLiters: '',
        temperatureC: '',
      }))
    )
    setTankRows(tankRowsFromStation(tanks))
    setPumps([emptyPump()])
  }

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  async function readBienBan() {
    const files = [...(bienBanRef.current?.files ?? [])]
    if (files.length === 0) {
      toast.error(vi.imports.noBienBanPhotos)
      return
    }
    setBienBanFiles(files)
    const form = new FormData()
    for (const file of files) form.append('photos', file)
    setBusy(true)
    const res = await fetch('/api/imports/extract', { method: 'POST', body: form })
    setBusy(false)
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      toast.error(data?.error ?? vi.imports.readFailed)
      return
    }
    const { data } = (await res.json()) as { data: BienBanExtraction }
    setRawExtract(data)
    const filled = applyExtraction(data, tanks)
    setProducts(filled.products.length > 0 ? filled.products : [emptyProduct()])
    setCompartments(filled.compartments)
    setTankRows(filled.tanks)
    setPumps(filled.pumps.length > 0 ? filled.pumps : [emptyPump()])
    setStaffName(data.staffName ?? '')
    setDriverName(data.driverName ?? '')
    setTruckPlate(data.truckPlate ?? '')
    setVehicleCheck(data.vehicleCheck ?? '')
    setNote(data.note ?? '')
    if (data.receiptDate) setImportedAt(`${data.receiptDate}T00:00`)
    setStep(2)
  }

  function manualEntry() {
    setBienBanFiles([...(bienBanRef.current?.files ?? [])])
    setStep(2)
  }

  async function confirm() {
    if (!importedAt) {
      toast.error(vi.imports.selectDate)
      return
    }
    const tanksPayload = tankRows.map((t) => ({
      tankLabel: t.tankLabel || t.tankCode || '—',
      tankCode: t.tankCode || null,
      fuelType: t.fuelType || null,
      importedLiters: parseVnNumber(t.importedLiters),
      before: {
        temperatureC: parseVnNumber(t.before.temperatureC),
        heightMm: parseVnNumber(t.before.heightMm),
        bookLiters: parseVnNumber(t.before.bookLiters),
        baremLiters: parseVnNumber(t.before.baremLiters),
      },
      after: {
        temperatureC: parseVnNumber(t.after.temperatureC),
        heightMm: parseVnNumber(t.after.heightMm),
        bookLiters: parseVnNumber(t.after.bookLiters),
        baremLiters: parseVnNumber(t.after.baremLiters),
      },
    }))
    const receiving = tanksPayload.filter(
      (t) => t.tankCode && t.importedLiters !== null && t.importedLiters > 0
    )
    if (receiving.length === 0) {
      toast.error(vi.imports.noTankLiters)
      return
    }
    if (receiving.some((t) => !t.fuelType)) {
      toast.error(vi.imports.selectFuel)
      return
    }

    const payload = {
      stationId,
      importedAt: new Date(importedAt).toISOString(),
      staffName: staffName || null,
      driverName: driverName || null,
      truckPlate: truckPlate || null,
      vehicleCheck: vehicleCheck || null,
      note: note || null,
      products: products
        .filter((p) => p.productLabel.trim() !== '')
        .map((p) => ({
          productLabel: p.productLabel.trim(),
          warehouse: p.warehouse || null,
          quantityLiters: parseVnNumber(p.quantityLiters),
          exportSlipNo: p.exportSlipNo || null,
          sealNo: p.sealNo || null,
        })),
      compartments: compartments
        .map((c, index) => ({
          compartmentNo: index + 1,
          liters: parseVnNumber(c.liters),
          valvePosition: c.valvePosition || null,
          compensationLiters: parseVnNumber(c.compensationLiters),
          temperatureC: parseVnNumber(c.temperatureC),
        }))
        .filter(
          (c) =>
            c.liters !== null ||
            c.valvePosition !== null ||
            c.compensationLiters !== null ||
            c.temperatureC !== null
        ),
      tanks: tanksPayload,
      pumps: pumps
        .filter(
          (p) =>
            p.pumpLabel !== '' ||
            p.before.electronic !== '' ||
            p.before.mechanical !== '' ||
            p.after.electronic !== '' ||
            p.after.mechanical !== ''
        )
        .map((p) => ({
          pumpLabel: p.pumpLabel || null,
          before: {
            electronic: parseVnNumber(p.before.electronic),
            mechanical: parseVnNumber(p.before.mechanical),
          },
          after: {
            electronic: parseVnNumber(p.after.electronic),
            mechanical: parseVnNumber(p.after.mechanical),
          },
        })),
      rawExtract,
    }

    const form = new FormData()
    form.set('payload', JSON.stringify(payload))
    for (const file of bienBanFiles) form.append('bienBan', file)
    setBusy(true)
    const res = await fetch('/api/imports/receipts', { method: 'POST', body: form })
    setBusy(false)
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      toast.error(data?.error ?? vi.errors.generic)
      return
    }
    const { data } = (await res.json()) as { data: { id: string } }
    setReceiptId(data.id)
    toast.success(vi.imports.receiptSaved)
    router.refresh()
    setStep(3)
  }

  async function uploadRelated() {
    const files = relatedRef.current?.files ?? []
    if (!receiptId || files.length === 0) {
      finish()
      return
    }
    const form = new FormData()
    for (const file of files) form.append('photos', file)
    setBusy(true)
    const res = await fetch(`/api/imports/receipts/${receiptId}/documents`, {
      method: 'POST',
      body: form,
    })
    setBusy(false)
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      toast.error(data?.error ?? vi.errors.generic)
      return
    }
    toast.success(vi.imports.relatedSaved)
    finish()
  }

  function finish() {
    setOpen(false)
    reset()
    router.refresh()
  }

  const stepTitle = step === 1 ? vi.imports.step1 : step === 2 ? vi.imports.step2 : vi.imports.step3

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">{vi.imports.addButton}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {vi.imports.bienBanTitle}
            <span className="text-muted-foreground ml-2 text-sm font-normal">{stepTitle}</span>
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">{vi.imports.uploadBienBanHint}</p>
            <Input ref={bienBanRef} type="file" multiple accept="image/*" />
            <DialogFooter>
              <Button variant="outline" onClick={manualEntry} disabled={busy}>
                {vi.imports.manualEntry}
              </Button>
              <Button onClick={readBienBan} disabled={busy}>
                {busy ? vi.imports.reading : vi.imports.readAi}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">{vi.imports.checkExtracted}</p>

            {/* Header: who handed over to whom, which tanker, when */}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel>{vi.imports.importedAt}</FieldLabel>
                <Input
                  type="datetime-local"
                  value={importedAt}
                  onChange={(e) => setImportedAt(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>{vi.imports.staffName}</FieldLabel>
                <Input value={staffName} onChange={(e) => setStaffName(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel>{vi.imports.driverName}</FieldLabel>
                <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel>{vi.imports.truckPlate}</FieldLabel>
                <Input value={truckPlate} onChange={(e) => setTruckPlate(e.target.value)} />
              </Field>
            </div>

            {/* Product table — one column per product, like the paper form */}
            <section className="space-y-1">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">{vi.imports.productsTitle}</h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setProducts((prev) => [...prev, emptyProduct()])}
                >
                  {vi.imports.addProduct}
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-xs">
                  <tbody>
                    <tr>
                      <td className="text-muted-foreground w-32 p-1">{vi.imports.productLabel}</td>
                      {products.map((p, i) => (
                        <td key={i} className="p-1">
                          <Input
                            className="h-8 px-1.5 text-xs font-semibold"
                            value={p.productLabel}
                            placeholder="RON 95"
                            onChange={(e) =>
                              setProducts((prev) =>
                                prev.map((row, j) =>
                                  j === i ? { ...row, productLabel: e.target.value } : row
                                )
                              )
                            }
                          />
                        </td>
                      ))}
                    </tr>
                    {(
                      [
                        ['warehouse', vi.imports.warehouse],
                        ['quantityLiters', vi.imports.productQuantity],
                        ['exportSlipNo', vi.imports.exportSlipNo],
                        ['sealNo', vi.imports.sealNo],
                      ] as const
                    ).map(([key, label]) => (
                      <tr key={key}>
                        <td className="text-muted-foreground w-32 p-1">{label}</td>
                        {products.map((p, i) => (
                          <td key={i} className="p-1">
                            <Input
                              className={cellClass}
                              value={p[key]}
                              onChange={(e) =>
                                setProducts((prev) =>
                                  prev.map((row, j) =>
                                    j === i ? { ...row, [key]: e.target.value } : row
                                  )
                                )
                              }
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* (a) tanker compartments */}
            <section className="space-y-1">
              <h4 className="text-sm font-semibold">{vi.imports.compartmentsTitle}</h4>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[32rem] text-xs">
                  <thead>
                    <tr className="text-muted-foreground text-left">
                      <th className="w-16 p-1">{vi.imports.compartment}</th>
                      <th className="p-1">{vi.imports.compartmentLiters}</th>
                      <th className="p-1">{vi.imports.valvePosition}</th>
                      <th className="p-1">{vi.imports.compensationLiters}</th>
                      <th className="p-1">{vi.imports.truckTemp}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compartments.map((c, i) => (
                      <tr key={i}>
                        <td className="p-1 font-medium">
                          {vi.imports.compartment} {i + 1}
                        </td>
                        {(
                          ['liters', 'valvePosition', 'compensationLiters', 'temperatureC'] as const
                        ).map((key) => (
                          <td key={key} className="p-1">
                            <Input
                              className={cellClass}
                              value={c[key]}
                              onChange={(e) =>
                                setCompartments((prev) =>
                                  prev.map((row, j) =>
                                    j === i ? { ...row, [key]: e.target.value } : row
                                  )
                                )
                              }
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* (b) vehicle check */}
            <section className="space-y-1">
              <h4 className="text-sm font-semibold">{vi.imports.vehicleCheckTitle}</h4>
              <Field>
                <FieldLabel>{vi.imports.vehicleCheck}</FieldLabel>
                <Input value={vehicleCheck} onChange={(e) => setVehicleCheck(e.target.value)} />
              </Field>
            </section>

            {/* (c) station tanks before/after + the liters that move inventory */}
            <section className="space-y-1">
              <h4 className="text-sm font-semibold">{vi.imports.tanksTitle}</h4>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[56rem] text-xs">
                  <thead>
                    <tr className="text-muted-foreground text-left">
                      <th className="p-1"></th>
                      <th className="border-l p-1 text-center" colSpan={4}>
                        {vi.imports.before}
                      </th>
                      <th className="border-l p-1 text-center" colSpan={4}>
                        {vi.imports.after}
                      </th>
                      <th className="border-l p-1" colSpan={2}></th>
                    </tr>
                    <tr className="text-muted-foreground text-left">
                      <th className="w-24 p-1">{vi.inventory.tank}</th>
                      <th className="border-l p-1">{vi.imports.tankTemp}</th>
                      <th className="p-1">{vi.imports.heightMm}</th>
                      <th className="p-1">{vi.imports.bookLiters}</th>
                      <th className="p-1">{vi.imports.baremLiters}</th>
                      <th className="border-l p-1">{vi.imports.tankTemp}</th>
                      <th className="p-1">{vi.imports.heightMm}</th>
                      <th className="p-1">{vi.imports.bookLiters}</th>
                      <th className="p-1">{vi.imports.baremLiters}</th>
                      <th className="border-l p-1">{vi.imports.importedLiters}</th>
                      <th className="p-1">{vi.inventory.fuelType}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tankRows.map((t, i) => {
                      const updateSide =
                        (side: 'before' | 'after', key: keyof SideCells) =>
                        (e: ChangeEvent<HTMLInputElement>) =>
                          setTankRows((prev) =>
                            prev.map((row, j) =>
                              j === i
                                ? { ...row, [side]: { ...row[side], [key]: e.target.value } }
                                : row
                            )
                          )
                      return (
                        <tr key={i}>
                          <td className="p-1 font-medium whitespace-nowrap">{t.tankLabel}</td>
                          {(['before', 'after'] as const).map((side) =>
                            (
                              ['temperatureC', 'heightMm', 'bookLiters', 'baremLiters'] as const
                            ).map((key, k) => (
                              <td
                                key={`${side}-${key}`}
                                className={`p-1 ${k === 0 ? 'border-l' : ''}`}
                              >
                                <Input
                                  className={cellClass}
                                  value={t[side][key]}
                                  onChange={updateSide(side, key)}
                                />
                              </td>
                            ))
                          )}
                          <td className="border-l p-1">
                            <Input
                              className={`${cellClass} font-semibold`}
                              value={t.importedLiters}
                              onChange={(e) =>
                                setTankRows((prev) =>
                                  prev.map((row, j) =>
                                    j === i ? { ...row, importedLiters: e.target.value } : row
                                  )
                                )
                              }
                            />
                          </td>
                          <td className="p-1">
                            <Select
                              value={t.fuelType}
                              onValueChange={(value) =>
                                setTankRows((prev) =>
                                  prev.map((row, j) =>
                                    j === i ? { ...row, fuelType: value } : row
                                  )
                                )
                              }
                            >
                              <SelectTrigger className="h-8 w-28 text-xs">
                                <SelectValue placeholder={vi.inventory.fuelType} />
                              </SelectTrigger>
                              <SelectContent>
                                {fuelOptions.map(([value, label]) => (
                                  <SelectItem key={value} value={value}>
                                    {label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* (d) pump totals — the diff must stay 0 (no sales during import) */}
            <section className="space-y-1">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">{vi.imports.pumpsTitle}</h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPumps((prev) => [...prev, emptyPump()])}
                >
                  {vi.imports.addPump}
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem] text-xs">
                  <thead>
                    <tr className="text-muted-foreground text-left">
                      <th className="p-1"></th>
                      <th className="border-l p-1 text-center" colSpan={2}>
                        {vi.imports.before}
                      </th>
                      <th className="border-l p-1 text-center" colSpan={2}>
                        {vi.imports.after}
                      </th>
                      <th className="border-l p-1 text-center" colSpan={2}>
                        {vi.imports.pumpDiff}
                      </th>
                    </tr>
                    <tr className="text-muted-foreground text-left">
                      <th className="w-20 p-1">{vi.imports.pump}</th>
                      <th className="border-l p-1">{vi.imports.totalElectronic}</th>
                      <th className="p-1">{vi.imports.totalMechanical}</th>
                      <th className="border-l p-1">{vi.imports.totalElectronic}</th>
                      <th className="p-1">{vi.imports.totalMechanical}</th>
                      <th className="border-l p-1">{vi.imports.totalElectronic}</th>
                      <th className="p-1">{vi.imports.totalMechanical}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pumps.map((p, i) => {
                      const diffE = pumpDiff(p.before.electronic, p.after.electronic)
                      const diffM = pumpDiff(p.before.mechanical, p.after.mechanical)
                      const update =
                        (side: 'before' | 'after', key: 'electronic' | 'mechanical') =>
                        (e: ChangeEvent<HTMLInputElement>) =>
                          setPumps((prev) =>
                            prev.map((row, j) =>
                              j === i
                                ? { ...row, [side]: { ...row[side], [key]: e.target.value } }
                                : row
                            )
                          )
                      return (
                        <tr key={i}>
                          <td className="p-1">
                            <Input
                              className={cellClass}
                              value={p.pumpLabel}
                              placeholder={`${vi.imports.pump} ${i + 1}`}
                              onChange={(e) =>
                                setPumps((prev) =>
                                  prev.map((row, j) =>
                                    j === i ? { ...row, pumpLabel: e.target.value } : row
                                  )
                                )
                              }
                            />
                          </td>
                          <td className="border-l p-1">
                            <Input
                              className={cellClass}
                              value={p.before.electronic}
                              onChange={update('before', 'electronic')}
                            />
                          </td>
                          <td className="p-1">
                            <Input
                              className={cellClass}
                              value={p.before.mechanical}
                              onChange={update('before', 'mechanical')}
                            />
                          </td>
                          <td className="border-l p-1">
                            <Input
                              className={cellClass}
                              value={p.after.electronic}
                              onChange={update('after', 'electronic')}
                            />
                          </td>
                          <td className="p-1">
                            <Input
                              className={cellClass}
                              value={p.after.mechanical}
                              onChange={update('after', 'mechanical')}
                            />
                          </td>
                          <td
                            className={`border-l p-1 text-right font-mono ${
                              diffE ? 'text-destructive font-semibold' : 'text-muted-foreground'
                            }`}
                          >
                            {diffE ?? '—'}
                          </td>
                          <td
                            className={`p-1 text-right font-mono ${
                              diffM ? 'text-destructive font-semibold' : 'text-muted-foreground'
                            }`}
                          >
                            {diffM ?? '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* (e) notes */}
            <section className="space-y-1">
              <h4 className="text-sm font-semibold">{vi.imports.noteTitle}</h4>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </section>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(1)} disabled={busy}>
                {vi.imports.back}
              </Button>
              <Button onClick={confirm} disabled={busy}>
                {vi.imports.confirmSave}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">{vi.imports.relatedHint}</p>
            <Input ref={relatedRef} type="file" multiple accept="image/*,.pdf" />
            <DialogFooter>
              <Button variant="outline" onClick={finish} disabled={busy}>
                {vi.imports.skipRelated}
              </Button>
              <Button onClick={uploadRelated} disabled={busy}>
                {busy ? vi.imports.uploading : vi.imports.done}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
