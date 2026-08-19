'use client'

import { toast } from 'sonner'

import { type ChangeEvent, Fragment, useEffect, useMemo, useRef, useState } from 'react'

import { useRouter } from 'next/navigation'

import { useFuelCatalogue } from '@/components/fuels/catalogue-provider'
import { NoStationFuels } from '@/components/fuels/no-station-fuels'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import {
  type CatalogueFuel,
  type StationFuelMapping,
  fuelWordResolver,
} from '@/lib/fuels/catalogue'
import { type BienBanExtraction, type TankSideCheck, parseVnNumber } from '@/lib/imports/bien-ban'
import {
  type BindingRefusal,
  type PumpRosterEntry,
  type TankRosterEntry,
} from '@/lib/imports/binding-ladder'
import {
  type GoodsColumn,
  bienBanSeal,
  emptyGoodsColumn,
  goodsColumnRecorded,
  goodsColumns,
} from '@/lib/imports/goods-columns'
import {
  type StationPump,
  movedLiters,
  pumpName,
  reviewPumpRows,
  tankTaints,
} from '@/lib/imports/pump-rows'
import { type StationMismatch, type StationOnPaper } from '@/lib/imports/station-on-paper'
import { reviewTankRows } from '@/lib/imports/tank-rows'
import { type BaremLookup, type BaremLookupResult, type BaremRefusal } from '@/lib/inventory/barem'
import {
  deliveryNoteLiters,
  resolveTankBarem,
  savedCell,
  shownCell,
} from '@/lib/inventory/barem-form'
import { vi } from '@/messages/vi'

export type TankOption = {
  code: string // "HAM_2"
  label: string // "Hầm 2 — Xăng E0 (13K)"
  fuelType: string | null
  /** Thousands of litres — the binding ladder's veto against a printed capacity. */
  capacityK: number | null
}

// Every cell is a free-text string while editing (mirrors the paper form);
// numbers are parsed once on confirm.
type CompartmentRow = {
  liters: string
  valvePosition: string
  compensationLiters: string
  temperatureC: string
}
type SideCells = {
  temperatureC: string
  heightMm: string
  bookLiters: string
  /** What the reviewer typed over the Barem's figure; empty means "use the Barem". */
  baremLiters: string
  /** The AI's reading of the handwritten SL barem — the comparison, not the value. */
  paperBaremLiters: number | null
}
type TankRow = {
  tankLabel: string
  /** Empty on a row the binding ladder could not attribute to a Hầm. */
  tankCode: string
  /** Why this row names no Hầm — it gets no Barem lookup and no phiếu nhập. */
  refusal: BindingRefusal | null
  fuelType: string
  importedLiters: string
  before: SideCells
  after: SideCells
}
type PumpRow = {
  pumpLabel: string
  /** Empty on a row the binding ladder could not attribute to a Trụ. */
  pumpCode: string
  /** The Hầm a difference on this row taints, where the Trạm configured one. */
  tankCode: string
  before: { electronic: string; mechanical: string }
  after: { electronic: string; mechanical: string }
}

const emptySide = (): SideCells => ({
  temperatureC: '',
  heightMm: '',
  bookLiters: '',
  baremLiters: '',
  paperBaremLiters: null,
})
const emptyPump = (): PumpRow => ({
  pumpLabel: '',
  pumpCode: '',
  tankCode: '',
  before: { electronic: '', mechanical: '' },
  after: { electronic: '', mechanical: '' },
})

const cellOf = (value: number | string | null | undefined): string =>
  value === null || value === undefined ? '' : String(value)

function tankRowsFromStation(tanks: TankOption[]): TankRow[] {
  return tanks.map((t) => ({
    tankLabel: t.code.replace('HAM_', 'Hầm '),
    tankCode: t.code,
    refusal: null,
    fuelType: t.fuelType ?? '',
    importedLiters: '',
    before: emptySide(),
    after: emptySide(),
  }))
}

/**
 * Section (d)'s rows: the Trạm's own Trụ, with what the biên bản printed bound
 * onto them. Seeded even before an extraction, so a Trụ nobody read is an empty
 * row rather than an absent one — (d) is what proves nothing was sold while the
 * Hầm were being measured, and a missing row proves nothing while looking as
 * though it does.
 */
function formPumpRows(
  stationPumps: readonly StationPump[],
  extracted: BienBanExtraction['pumps'],
  paperPumps: readonly PumpRosterEntry[]
): PumpRow[] {
  const rows = reviewPumpRows(stationPumps, extracted, paperPumps).map((row) => ({
    pumpLabel: row.pumpLabel,
    pumpCode: row.pumpCode ?? '',
    tankCode: row.tankCode ?? '',
    before: {
      electronic: cellOf(row.checks?.before.electronic),
      mechanical: cellOf(row.checks?.before.mechanical),
    },
    after: {
      electronic: cellOf(row.checks?.after.electronic),
      mechanical: cellOf(row.checks?.after.mechanical),
    },
  }))
  // A Trạm neither the database nor the paper knows still needs a row to type in.
  return rows.length > 0 ? rows : [emptyPump()]
}

/** Merges the AI extraction into the form rows (station tanks stay first). */
function applyExtraction(
  extraction: BienBanExtraction,
  stationTanks: TankOption[],
  paperTanks: readonly TankRosterEntry[],
  stationPumps: readonly StationPump[],
  paperPumps: readonly PumpRosterEntry[]
) {
  const products = goodsColumns(extraction.products)

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

  // Which Hầm each printed row is — or the reason it names none (ADR 0004).
  // SL barem is no longer what the AI made of the handwriting: the cell is
  // filled from the Barem for the height in this row (ADR 0002), and the AI's
  // reading is kept beside it as the comparison.
  const sideCells = (side: TankSideCheck): SideCells => ({
    temperatureC: cellOf(side.temperatureC),
    heightMm: cellOf(side.heightMm),
    bookLiters: cellOf(side.bookLiters),
    baremLiters: '',
    paperBaremLiters: side.baremLiters,
  })
  const tanks: TankRow[] = reviewTankRows(
    stationTanks.map((t) => ({ tankCode: t.code, fuelType: t.fuelType, capacityK: t.capacityK })),
    extraction.tanks,
    paperTanks
  ).map((row) => ({
    tankLabel: row.tankLabel,
    tankCode: row.tankCode ?? '',
    refusal: row.refusal,
    fuelType: row.fuelType ?? '',
    importedLiters: '',
    before: row.checks ? sideCells(row.checks.before) : emptySide(),
    after: row.checks ? sideCells(row.checks.after) : emptySide(),
  }))
  // "Nhập vào hầm" is no longer copied from the delivery note: it is the Hầm's
  // own measurement, barem(after) − barem(before), filled once the heights
  // resolve (ADR 0002). The note's quantity is shown beside it as the comparison.

  const pumps = formPumpRows(stationPumps, extraction.pumps, paperPumps)

  return { products, compartments, tanks, pumps }
}

function pumpDiff(before: string, after: string): number | null {
  const b = parseVnNumber(before)
  const a = parseVnNumber(after)
  if (b === null || a === null) return null
  return Math.round((a - b) * 100) / 100
}

/** Both of a row's totaliser differences, put to the rule that decides whether
 *  the Trụ moved at all. */
function pumpMovedLiters(p: PumpRow): number | null {
  return movedLiters(
    pumpDiff(p.before.electronic, p.after.electronic),
    pumpDiff(p.before.mechanical, p.after.mechanical)
  )
}

/** A row carrying no totaliser at all: a Trụ seeded from the roster that the
 *  biên bản left blank. It belongs in the review — (d) is the Trạm's own Trụ —
 *  but not in the saved receipt, which records what the paper said. */
function pumpWasRead(p: PumpRow): boolean {
  return [p.before.electronic, p.before.mechanical, p.after.electronic, p.after.mechanical].some(
    (cell) => cell !== ''
  )
}

const cellClass = 'h-8 px-1.5 font-mono text-xs'

/** Long enough that typing "1.505" asks the Barem once, not five times. */
const RESOLVE_DEBOUNCE_MS = 400

type BaremRequest = { tankCode: string; heightMm: number }

function heightKey(tankCode: string, heightMm: number): string {
  return `${tankCode}|${heightMm}`
}

/** What one side asks the Barem: the Hầm and its height to the nearest
 *  millimetre. Null when there is nothing to ask — no height measured, or a Hầm
 *  this Trạm does not have, which the form answers itself below. */
function baremRequest(row: TankRow, side: 'before' | 'after'): BaremRequest | null {
  const heightMm = parseVnNumber(row[side].heightMm)
  if (heightMm === null || !row.tankCode) return null
  return { tankCode: row.tankCode, heightMm: Math.round(heightMm) }
}

/** The Barem's answer for one side: null while it is still being asked. A row
 *  bound to no Hầm asks nothing at all — the ladder's reason is what it shows,
 *  and a Barem refusal on top of it would only say the same thing twice. */
function sideLookup(
  row: TankRow,
  side: 'before' | 'after',
  cache: Map<string, BaremLookup>
): BaremLookup | null {
  const heightMm = parseVnNumber(row[side].heightMm)
  if (heightMm === null || !row.tankCode) return null
  return cache.get(heightKey(row.tankCode, Math.round(heightMm))) ?? null
}

function refusalText(reason: BaremRefusal): string {
  if (reason === 'missing-point') return vi.imports.baremMissingPoint
  if (reason === 'unknown-tank') return vi.imports.baremUnknownTank
  return vi.imports.baremOutOfRange
}

/** Why a printed row could not be bound to a Hầm (ADR 0004). */
function bindingText(reason: BindingRefusal): string {
  if (reason === 'duplicate-number') return vi.imports.bindingDuplicateNumber
  if (reason === 'roster-mismatch') return vi.imports.bindingRosterMismatch
  return vi.imports.bindingUnidentified
}

/** How the mismatch alert names a Trạm. A Trạm known only from the printed
 *  rosters has no name, so the code stands alone rather than in brackets. */
function stationLabel(name: string | null, code: string): string {
  return name ? `${name} (${code})` : code
}

/** Litres beside a cell, grouped and without forced decimals — the Barem deals
 *  in whole litres, so `formatLiters`' fixed "12,358.00" would only add noise. */
function baremLitersText(liters: number): string {
  return liters.toLocaleString('en-US')
}

/**
 * "Nhập hàng" wizard mirroring the paper BIÊN BẢN GIAO NHẬN XĂNG DẦU:
 * 1) upload the biên bản photo(s), AI pre-fills the form;
 * 2) review the form section-by-section against the paper and confirm;
 * 3) upload every related photo of the delivery session for later audits.
 */
export function FuelImportForm({
  stationId,
  fuels,
  fuelMappings,
  tanks,
  paperTanks,
  stationPumps,
  paperPumps,
}: {
  stationId: string
  /** What section (c) may name as the nhiên liệu of a Hầm: what this Trạm sells,
   *  which is its Map nhiên liệu rows minus what Trường Thịnh stopped selling. */
  fuels: readonly CatalogueFuel[]
  /** This Trạm's mã hàng — what lets a goods column printed with one be read as
   *  the nhiên liệu it names, the same way a repainted trụ plate is. */
  fuelMappings: readonly StationFuelMapping[]
  tanks: TankOption[]
  /** The Hầm this Trạm's own pre-printed biên bản lists — what the binding
   *  ladder falls back on where the database has no Hầm to check against. */
  paperTanks: readonly TankRosterEntry[]
  /** The Trạm's Trụ, and the Hầm each draws from — section (d)'s rows, and
   *  what tells (c) which Hầm a moving Trụ contaminates. */
  stationPumps: readonly StationPump[]
  /** The Trụ the pre-printed biên bản lists, for a Trạm with no dispensers
   *  configured. It says no Hầm, so on its word alone a Trụ taints nothing. */
  paperPumps: readonly PumpRosterEntry[]
}) {
  const router = useRouter()
  // The danh mục whole, not this Trạm's slice: a goods column is resolved by the
  // rule that reads a trụ plate, which asks the mã hàng first and the danh mục's
  // tên and khóa after.
  const catalogue = useFuelCatalogue()
  const resolveFuel = useMemo(
    () => fuelWordResolver(catalogue, fuelMappings),
    [catalogue, fuelMappings]
  )
  const bienBanRef = useRef<HTMLInputElement>(null)
  const pxkRef = useRef<HTMLInputElement>(null)
  const relatedRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [busy, setBusy] = useState(false)
  const [bienBanFiles, setBienBanFiles] = useState<File[]>([])
  const [pxkFiles, setPxkFiles] = useState<File[]>([])
  const [rawExtract, setRawExtract] = useState<BienBanExtraction | null>(null)
  const [receiptId, setReceiptId] = useState<string | null>(null)
  // Set when the header names another Trạm (ADR 0006). While it is set the
  // wizard stays on step 1: nothing of the extraction is applied and no review
  // form is built, because those rows would be bound against this Trạm's Hầm.
  const [stationMismatch, setStationMismatch] = useState<StationMismatch | null>(null)

  const [importedAt, setImportedAt] = useState('')
  const [staffName, setStaffName] = useState('')
  const [driverName, setDriverName] = useState('')
  const [truckPlate, setTruckPlate] = useState('')
  const [vehicleCheck, setVehicleCheck] = useState('')
  const [note, setNote] = useState('')
  const [sealNo, setSealNo] = useState('')
  const [products, setProducts] = useState<GoodsColumn[]>(() => goodsColumns([]))
  const [compartments, setCompartments] = useState<CompartmentRow[]>(
    Array.from({ length: 5 }, () => ({
      liters: '',
      valvePosition: '',
      compensationLiters: '',
      temperatureC: '',
    }))
  )
  const [tankRows, setTankRows] = useState<TankRow[]>(tankRowsFromStation(tanks))
  const [pumps, setPumps] = useState<PumpRow[]>(() => formPumpRows(stationPumps, [], paperPumps))
  // Every (Hầm, mm) this form has already asked about. Heights repeat between
  // rows and across edits, so the answers are kept rather than re-fetched.
  const [baremCache, setBaremCache] = useState<Map<string, BaremLookup>>(() => new Map())
  // The last batch never came back. Says so on the rows still waiting, because a
  // cell that is blank for a reason nobody can see is the worst of both.
  const [lookupFailed, setLookupFailed] = useState(false)
  const askedRef = useRef(new Set<string>())

  // The heights the current rows need resolved — the extraction fills them all
  // at once, and editing one adds exactly one more.
  const needed = useMemo(() => {
    const requests = new Map<string, BaremRequest>()
    for (const row of tankRows) {
      for (const side of ['before', 'after'] as const) {
        const request = baremRequest(row, side)
        if (request) requests.set(heightKey(request.tankCode, request.heightMm), request)
      }
    }
    return [...requests.values()]
  }, [tankRows])

  useEffect(() => {
    const batch = needed.filter((r) => !askedRef.current.has(heightKey(r.tankCode, r.heightMm)))
    if (batch.length === 0) return
    const timer = setTimeout(async () => {
      for (const r of batch) askedRef.current.add(heightKey(r.tankCode, r.heightMm))
      const res = await fetch('/api/barem/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId, heights: batch }),
      }).catch(() => null)
      if (!res?.ok) {
        // Forgotten, so correcting a height asks again — and said out loud, so
        // until then the reviewer knows to type the litres rather than wait.
        for (const r of batch) askedRef.current.delete(heightKey(r.tankCode, r.heightMm))
        setLookupFailed(true)
        return
      }
      const { data } = (await res.json()) as { data: BaremLookupResult[] }
      setLookupFailed(false)
      setBaremCache((prev) => {
        const next = new Map(prev)
        for (const r of data) {
          next.set(
            heightKey(r.tankCode, r.heightMm),
            r.ok ? { ok: true, liters: r.liters } : { ok: false, reason: r.reason }
          )
        }
        return next
      })
    }, RESOLVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [needed, stationId])

  // A Trụ that moved was drawing fuel out of its Hầm while that Hầm's height
  // was being measured, so the measured intake on that (c) row is suspect. Said
  // where the reviewer is looking — and never as a block on confirming.
  const taints = useMemo(
    () =>
      tankTaints(
        pumps.map((p) => ({
          pumpCode: p.pumpCode || null,
          tankCode: p.tankCode || null,
          movedLiters: pumpMovedLiters(p),
        }))
      ),
    [pumps]
  )

  // Each row paired with what the Barem says about it, and what the delivery
  // note says beside that.
  const resolvedRows = useMemo(() => {
    const noteProducts = products.map((p) => ({
      productLabel: p.productLabel,
      quantityLiters: parseVnNumber(p.quantityLiters),
    }))
    return tankRows.map((row) => {
      const before = sideLookup(row, 'before', baremCache)
      const after = sideLookup(row, 'after', baremCache)
      return {
        row,
        barem: resolveTankBarem({
          before,
          after,
          paperBaremBefore: row.before.paperBaremLiters,
          paperBaremAfter: row.after.paperBaremLiters,
        }),
        deliveryLiters: deliveryNoteLiters(noteProducts, row.fuelType || null, resolveFuel),
        // A height typed but not yet answered — the cells are blank for a moment.
        asking:
          (before === null && baremRequest(row, 'before') !== null) ||
          (after === null && baremRequest(row, 'after') !== null),
      }
    })
  }, [tankRows, baremCache, products, resolveFuel])

  function reset() {
    setStep(1)
    setBienBanFiles([])
    setPxkFiles([])
    setRawExtract(null)
    setStationMismatch(null)
    setReceiptId(null)
    setImportedAt('')
    setStaffName('')
    setDriverName('')
    setTruckPlate('')
    setVehicleCheck('')
    setNote('')
    setSealNo('')
    setProducts(goodsColumns([]))
    setCompartments(
      Array.from({ length: 5 }, () => ({
        liters: '',
        valvePosition: '',
        compensationLiters: '',
        temperatureC: '',
      }))
    )
    setTankRows(tankRowsFromStation(tanks))
    setPumps(formPumpRows(stationPumps, [], paperPumps))
    setBaremCache(new Map())
    setLookupFailed(false)
    askedRef.current = new Set()
  }

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  /** Both papers must be in hand before anything is read: the biên bản (what
   *  the AI reads the numbers from) AND the phiếu xuất kho (what the numbers
   *  are later cross-checked against). */
  function collectStepOneFiles(): { bienBan: File[]; pxk: File[] } | null {
    const bienBan = [...(bienBanRef.current?.files ?? [])]
    const pxk = [...(pxkRef.current?.files ?? [])]
    if (bienBan.length === 0) {
      toast.error(vi.imports.noBienBanPhotos)
      return null
    }
    if (pxk.length === 0) {
      toast.error(vi.imports.noPxkFiles)
      return null
    }
    setBienBanFiles(bienBan)
    setPxkFiles(pxk)
    return { bienBan, pxk }
  }

  async function readBienBan() {
    const collected = collectStepOneFiles()
    if (!collected) return
    const files = collected.bienBan
    setStationMismatch(null)
    const form = new FormData()
    for (const file of files) form.append('photos', file)
    form.append('stationId', stationId)
    setBusy(true)
    const res = await fetch('/api/imports/extract', { method: 'POST', body: form })
    setBusy(false)
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      toast.error(data?.error ?? vi.imports.readFailed)
      return
    }
    const { data } = (await res.json()) as {
      data: { extraction: BienBanExtraction; stationCheck: StationOnPaper }
    }
    // The paper says it belongs to another Trạm. Stop here rather than pre-fill
    // a review form whose (c) rows would be bound against this Trạm's Hầm.
    if (data.stationCheck.verdict === 'mismatch') {
      setStationMismatch(data.stationCheck)
      return
    }
    const extraction = data.extraction
    setRawExtract(extraction)
    const filled = applyExtraction(extraction, tanks, paperTanks, stationPumps, paperPumps)
    setProducts(filled.products)
    setCompartments(filled.compartments)
    setTankRows(filled.tanks)
    setPumps(filled.pumps)
    // One box, however the sheet recorded it: the standard form's merged cell,
    // or an old sheet's per-column seals collapsed into it.
    setSealNo(bienBanSeal(extraction))
    setStaffName(extraction.staffName ?? '')
    setDriverName(extraction.driverName ?? '')
    setTruckPlate(extraction.truckPlate ?? '')
    setVehicleCheck(extraction.vehicleCheck ?? '')
    setNote(extraction.note ?? '')
    if (extraction.receiptDate) setImportedAt(`${extraction.receiptDate}T00:00`)
    setStep(2)
  }

  // Deliberately not gated on a refusal (ADR 0006): typing every cell by hand is
  // friction enough that nobody reaches for it to dodge the check, and it keeps
  // a misread header from ever trapping a delivery that really happened.
  function manualEntry() {
    if (!collectStepOneFiles()) return
    setStep(2)
  }

  async function confirm() {
    if (!importedAt) {
      toast.error(vi.imports.selectDate)
      return
    }
    // What is saved is what the reviewer sees confirmed: the Barem's figures
    // where they stand, their own where they overtyped. A later Barem import
    // never revisits this — the litres are written here, once.
    const tanksPayload = resolvedRows.map(({ row: t, barem }) => {
      return {
        tankLabel: t.tankLabel || t.tankCode || '—',
        tankCode: t.tankCode || null,
        fuelType: t.fuelType || null,
        importedLiters: savedCell(t.importedLiters, barem.intakeLiters),
        before: {
          temperatureC: parseVnNumber(t.before.temperatureC),
          heightMm: parseVnNumber(t.before.heightMm),
          bookLiters: parseVnNumber(t.before.bookLiters),
          baremLiters: savedCell(t.before.baremLiters, barem.baremBefore),
        },
        after: {
          temperatureC: parseVnNumber(t.after.temperatureC),
          heightMm: parseVnNumber(t.after.heightMm),
          bookLiters: parseVnNumber(t.after.bookLiters),
          baremLiters: savedCell(t.after.baremLiters, barem.baremAfter),
        },
      }
    })
    const receiving = tanksPayload.filter(
      (t) => t.tankCode && t.importedLiters !== null && t.importedLiters > 0
    )
    // A biên bản whose rows the ladder could not attribute books nothing — and
    // still has to be saved. The paper is the legal record; refusing it would
    // lose the trip as well as the Hầm. Read off the payload, so this asks
    // exactly what the API asks of it.
    const unattributed = tanksPayload.some((t) => !t.tankCode)
    if (receiving.length === 0 && !unattributed) {
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
      sealNo: sealNo || null,
      // A standard column nobody filled in is a pre-printed heading, not a
      // delivery: EA books nothing and is compared against no Hầm.
      products: products.filter(goodsColumnRecorded).map((p) => ({
        productLabel: p.productLabel.trim(),
        warehouse: p.warehouse || null,
        quantityLiters: parseVnNumber(p.quantityLiters),
        exportSlipNo: p.exportSlipNo || null,
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
      // Section (d) shows every Trụ the Trạm has; the receipt records the ones
      // the biên bản actually gave a reading for. A seeded row nobody filled in
      // would otherwise be saved under the app's own name for a Trụ, as though
      // the paper had named it.
      pumps: pumps.filter(pumpWasRead).map((p) => ({
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
    for (const file of pxkFiles) form.append('pxk', file)
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {vi.imports.bienBanTitle}
            <span className="text-muted-foreground ml-2 text-sm font-normal">{stepTitle}</span>
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">{vi.imports.uploadBienBanHint}</p>
            <Field>
              <FieldLabel>{vi.imports.bienBanFileLabel}</FieldLabel>
              <Input
                ref={bienBanRef}
                type="file"
                multiple
                accept="image/*"
                onChange={() => setStationMismatch(null)}
              />
            </Field>
            <Field>
              <FieldLabel>{vi.imports.pxkFileLabel}</FieldLabel>
              <Input ref={pxkRef} type="file" multiple accept="image/*,.pdf" />
            </Field>
            {stationMismatch && (
              <Alert variant="destructive">
                <AlertTitle>{vi.imports.stationMismatchTitle}</AlertTitle>
                <AlertDescription className="space-y-1">
                  <div>
                    {vi.imports.stationMismatchPaper}:{' '}
                    {stationLabel(stationMismatch.paperName, stationMismatch.paperCode)}
                  </div>
                  <div>
                    {vi.imports.stationMismatchCurrent}:{' '}
                    {stationLabel(stationMismatch.currentName, stationMismatch.currentCode)}
                  </div>
                  {/* The header verbatim. There is no override, so a misread has
                      to be visible rather than leave the reviewer guessing. */}
                  <div className="text-muted-foreground pt-1 text-xs">
                    {vi.imports.stationMismatchRead}: “{stationMismatch.paperLabel}”
                  </div>
                  <div>{vi.imports.stationMismatchHint}</div>
                </AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={manualEntry} disabled={busy}>
                {vi.imports.manualEntry}
              </Button>
              <Button onClick={readBienBan} loading={busy}>
                {busy ? vi.imports.reading : vi.imports.readAi}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 2 && (
          // min-w-0: DialogContent is a grid, so without this the wide tank/pump
          // tables would stretch the whole dialog into one horizontal scroller
          // instead of scrolling inside their own overflow-x-auto wrappers.
          <div className="min-w-0 space-y-4">
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
                  onClick={() => setProducts((prev) => [...prev, emptyGoodsColumn()])}
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
                    {/* One merged cell on the paper, one box here: the seal is
                        the biên bản's, not a column's. */}
                    <tr>
                      <td className="text-muted-foreground w-32 p-1">{vi.imports.sealNo}</td>
                      <td className="p-1" colSpan={products.length}>
                        <Input
                          className={cellClass}
                          value={sealNo}
                          onChange={(e) => setSealNo(e.target.value)}
                        />
                      </td>
                    </tr>
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
              {/* A Trạm that has declared no nhiên liệu leaves every (c) row's ô chọn
                  empty; said once above the table rather than once per row. */}
              {fuels.length === 0 && <NoStationFuels stationId={stationId} />}
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
                    {resolvedRows.map(({ row: t, barem, deliveryLiters, asking }, i) => {
                      const intakeCell = shownCell(t.importedLiters, barem.intakeLiters)
                      // The Trụ that were running while this Hầm was measured.
                      const taint = t.tankCode ? taints.get(t.tankCode) : undefined
                      const updateSide =
                        (side: 'before' | 'after', key: 'temperatureC' | 'bookLiters') =>
                        (e: ChangeEvent<HTMLInputElement>) =>
                          setTankRows((prev) =>
                            prev.map((row, j) =>
                              j === i
                                ? { ...row, [side]: { ...row[side], [key]: e.target.value } }
                                : row
                            )
                          )
                      // A corrected height re-resolves the row: the side's SL barem
                      // and the intake go back to whatever the Barem now says.
                      const updateHeight =
                        (side: 'before' | 'after') => (e: ChangeEvent<HTMLInputElement>) =>
                          setTankRows((prev) =>
                            prev.map((row, j) =>
                              j === i
                                ? {
                                    ...row,
                                    importedLiters: '',
                                    [side]: {
                                      ...row[side],
                                      heightMm: e.target.value,
                                      baremLiters: '',
                                    },
                                  }
                                : row
                            )
                          )
                      const updateBarem =
                        (side: 'before' | 'after') => (e: ChangeEvent<HTMLInputElement>) =>
                          setTankRows((prev) =>
                            prev.map((row, j) =>
                              j === i
                                ? { ...row, [side]: { ...row[side], baremLiters: e.target.value } }
                                : row
                            )
                          )
                      return (
                        <Fragment key={i}>
                          <tr>
                            <td className="p-1 font-medium whitespace-nowrap">{t.tankLabel}</td>
                            {(['before', 'after'] as const).map((side) => {
                              const paper = side === 'before' ? barem.paperBefore : barem.paperAfter
                              const computed =
                                side === 'before' ? barem.baremBefore : barem.baremAfter
                              return (
                                <Fragment key={side}>
                                  <td className="border-l p-1">
                                    <Input
                                      className={cellClass}
                                      value={t[side].temperatureC}
                                      onChange={updateSide(side, 'temperatureC')}
                                    />
                                  </td>
                                  <td className="p-1">
                                    <Input
                                      className={cellClass}
                                      value={t[side].heightMm}
                                      onChange={updateHeight(side)}
                                    />
                                  </td>
                                  <td className="p-1">
                                    <Input
                                      className={cellClass}
                                      value={t[side].bookLiters}
                                      onChange={updateSide(side, 'bookLiters')}
                                    />
                                  </td>
                                  <td className="p-1">
                                    <Input
                                      className={cellClass}
                                      value={shownCell(t[side].baremLiters, computed)}
                                      onChange={updateBarem(side)}
                                    />
                                    {/* What the station's book says, where it and the Barem disagree */}
                                    {paper !== null && (
                                      <div className="text-destructive mt-0.5 text-[10px] whitespace-nowrap">
                                        {vi.imports.baremOnPaper} {baremLitersText(paper)}
                                      </div>
                                    )}
                                  </td>
                                </Fragment>
                              )
                            })}
                            <td className="border-l p-1">
                              <Input
                                className={`${cellClass} font-semibold`}
                                value={intakeCell}
                                onChange={(e) =>
                                  setTankRows((prev) =>
                                    prev.map((row, j) =>
                                      j === i ? { ...row, importedLiters: e.target.value } : row
                                    )
                                  )
                                }
                              />
                              {/* The delivery note's claim, for comparison — never the value */}
                              {deliveryLiters !== null && (
                                <div className="text-muted-foreground mt-0.5 text-[10px] whitespace-nowrap">
                                  {vi.imports.deliveryNote} {baremLitersText(deliveryLiters)}
                                </div>
                              )}
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
                                  {fuels.map((fuel) => (
                                    <SelectItem key={fuel.fuelType} value={fuel.fuelType}>
                                      {fuel.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                          </tr>
                          {/* Why a cell is empty, and the reading that should not be */}
                          {(barem.fellLiters !== null ||
                            barem.reasons.length > 0 ||
                            t.refusal !== null ||
                            taint !== undefined ||
                            asking) && (
                            <tr>
                              <td></td>
                              <td colSpan={10} className="space-x-3 border-l px-1 pb-1 text-[11px]">
                                {/* No Hầm, so no barem and no phiếu nhập — the row
                                    still keeps everything the paper said. */}
                                {t.refusal !== null && (
                                  <span className="text-destructive font-medium">
                                    {bindingText(t.refusal)}
                                  </span>
                                )}
                                {barem.fellLiters !== null && (
                                  <span className="text-destructive font-medium">
                                    {vi.imports.baremTankFell} {baremLitersText(barem.fellLiters)} L
                                  </span>
                                )}
                                {/* Fuel left this Hầm while it was being measured
                                    (mục d) — a cue, never a block on lưu. */}
                                {taint !== undefined && (
                                  <span className="text-destructive font-medium">
                                    {taint
                                      .map(
                                        (moved) =>
                                          `${pumpName(moved.pumpCode)} ${vi.imports.pumpMoved} ${baremLitersText(moved.liters)} L`
                                      )
                                      .join(', ')}{' '}
                                    {vi.imports.pumpTaintsTank}
                                  </span>
                                )}
                                {barem.reasons.map((reason) => (
                                  <span key={reason} className="text-muted-foreground">
                                    {refusalText(reason)}
                                  </span>
                                ))}
                                {asking && (
                                  <span className="text-muted-foreground">
                                    {lookupFailed
                                      ? vi.imports.baremLookupFailed
                                      : vi.imports.baremResolving}
                                  </span>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
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
              <Button onClick={confirm} loading={busy}>
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
              <Button onClick={uploadRelated} loading={busy}>
                {busy ? vi.imports.uploading : vi.imports.done}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
