'use client'

import { useState } from 'react'

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
import { useSaveAction } from '@/hooks/use-save-action'
import { fuelsBookedBeforeOpening } from '@/lib/inventory/book-stock'
import { vi } from '@/messages/vi'

export type ReceiptEditLine = {
  id: string
  tankIndex: number
  tankCode: string
  litersActual: number
  beforeBaremLiters: number | null
  measuredLiters: number | null
}
export type ReceiptEditProduct = {
  index: number
  productLabel: string
  warehouse: string
  exportSlipNo: string
}
export type ReceiptEditHeader = {
  importedAt: string // GMT+7 datetime-local
  staffName: string
  driverName: string
  truckPlate: string
  vehicleCheck: string
  sealNo: string
  note: string
  invoiceNo: string
}

type TankChoice = { code: string; fuelType: string; label: string }
const toInputLines = (lines: ReceiptEditLine[]) =>
  lines.map((line) => ({
    ...line,
    litersActual: String(line.litersActual),
    beforeBaremLiters: line.beforeBaremLiters === null ? '' : String(line.beforeBaremLiters),
    measuredLiters: line.measuredLiters === null ? '' : String(line.measuredLiters),
  }))

export function ReceiptEditForm({
  receiptId,
  header,
  lines: savedLines,
  products: savedProducts,
  tanks,
  openingDates,
}: {
  receiptId: string
  header: ReceiptEditHeader
  lines: ReceiptEditLine[]
  products: ReceiptEditProduct[]
  tanks: TankChoice[]
  openingDates: Record<string, string>
}) {
  const { busy, save } = useSaveAction()
  const [open, setOpen] = useState(false)
  const [fields, setFields] = useState(header)
  const [lines, setLines] = useState(() => toInputLines(savedLines))
  const [products, setProducts] = useState(savedProducts)

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const importedAt = new Date(`${fields.importedAt}:00+07:00`)
    if (Number.isNaN(importedAt.getTime())) return
    const editedLines = lines.map((line) => ({
      ...line,
      litersActual: Number(line.litersActual),
      beforeBaremLiters: line.beforeBaremLiters === '' ? null : Number(line.beforeBaremLiters),
      measuredLiters: line.measuredLiters === '' ? null : Number(line.measuredLiters),
    }))
    const beforeOpening = fuelsBookedBeforeOpening(
      fields.importedAt.slice(0, 10),
      editedLines.map((line) => ({
        fuelType: tanks.find((tank) => tank.code === line.tankCode)?.fuelType ?? null,
        importedLiters: line.litersActual,
      })),
      openingDates
    )
    if (
      beforeOpening.length > 0 &&
      !window.confirm(
        vi.imports.beforeOpeningConfirm(
          beforeOpening.map((fuel) => `${fuel} (${openingDates[fuel]})`).join(', ')
        )
      )
    )
      return
    save(
      `/api/imports/receipts/${receiptId}`,
      {
        method: 'PATCH',
        body: { ...fields, importedAt: importedAt.toISOString(), products, lines: editedLines },
        success: vi.imports.editSaved,
      },
      { onSuccess: () => setOpen(false) }
    )
  }

  const headerFields = [
    ['staffName', vi.imports.staffName],
    ['driverName', vi.imports.driverName],
    ['truckPlate', vi.imports.truckPlate],
    ['vehicleCheck', vi.imports.vehicleCheck],
    ['sealNo', vi.imports.sealNo],
    ['note', vi.imports.note],
  ] as const

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setFields(header)
          setLines(toInputLines(savedLines))
          setProducts(savedProducts)
        }
        setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {vi.imports.editAction}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{vi.imports.editAction}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="import-edit-date">{vi.imports.importedAt}</FieldLabel>
            <Input
              id="import-edit-date"
              type="datetime-local"
              required
              value={fields.importedAt}
              onChange={(e) => setFields({ ...fields, importedAt: e.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            {headerFields.map(([key, label]) => (
              <Field key={key}>
                <FieldLabel htmlFor={`import-edit-${key}`}>{label}</FieldLabel>
                <Input
                  id={`import-edit-${key}`}
                  value={fields[key]}
                  onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
                />
              </Field>
            ))}
          </div>
          {products.length > 0 ? (
            <div className="space-y-3">
              <h3 className="font-medium">{vi.imports.goodsTitle}</h3>
              {products.map((product, index) => (
                <div key={product.index} className="grid gap-2 rounded border p-3 sm:grid-cols-2">
                  <p className="sm:col-span-2">{product.productLabel}</p>
                  <Field>
                    <FieldLabel htmlFor={`warehouse-${index}`}>{vi.imports.warehouse}</FieldLabel>
                    <Input
                      id={`warehouse-${index}`}
                      value={product.warehouse}
                      onChange={(e) =>
                        setProducts(
                          products.map((p, j) =>
                            j === index ? { ...p, warehouse: e.target.value } : p
                          )
                        )
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`slip-${index}`}>{vi.imports.exportSlipNo}</FieldLabel>
                    <Input
                      id={`slip-${index}`}
                      value={product.exportSlipNo}
                      onChange={(e) =>
                        setProducts(
                          products.map((p, j) =>
                            j === index ? { ...p, exportSlipNo: e.target.value } : p
                          )
                        )
                      }
                    />
                  </Field>
                </div>
              ))}
            </div>
          ) : (
            <Field>
              <FieldLabel htmlFor="import-edit-invoice">{vi.imports.exportSlipNo}</FieldLabel>
              <Input
                id="import-edit-invoice"
                value={fields.invoiceNo}
                onChange={(e) => setFields({ ...fields, invoiceNo: e.target.value })}
              />
            </Field>
          )}
          <div className="space-y-3">
            <h3 className="font-medium">{vi.imports.tanksTitle}</h3>
            {lines.map((line, index) => (
              <div key={line.id} className="grid gap-2 rounded border p-3 sm:grid-cols-2">
                <Field className="sm:col-span-2">
                  <FieldLabel>{vi.inventory.tank}</FieldLabel>
                  <Select
                    value={line.tankCode}
                    onValueChange={(value) =>
                      setLines(
                        lines.map((item, j) => (j === index ? { ...item, tankCode: value } : item))
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={vi.imports.selectTank} />
                    </SelectTrigger>
                    <SelectContent>
                      {tanks.map((tank) => (
                        <SelectItem key={tank.code} value={tank.code}>
                          {tank.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`booked-${index}`}>
                    {vi.imports.bookedLiters} (lít)
                  </FieldLabel>
                  <Input
                    id={`booked-${index}`}
                    type="number"
                    inputMode="decimal"
                    min="0.001"
                    step="0.001"
                    required
                    value={line.litersActual}
                    onChange={(e) =>
                      setLines(
                        lines.map((item, j) =>
                          j === index ? { ...item, litersActual: e.target.value } : item
                        )
                      )
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`before-${index}`}>
                    {vi.imports.baremBeforeLiters}
                  </FieldLabel>
                  <Input
                    id={`before-${index}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.001"
                    value={line.beforeBaremLiters}
                    onChange={(e) =>
                      setLines(
                        lines.map((item, j) =>
                          j === index ? { ...item, beforeBaremLiters: e.target.value } : item
                        )
                      )
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`measured-${index}`}>
                    {vi.imports.measuredLiters} (lít)
                  </FieldLabel>
                  <Input
                    id={`measured-${index}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.001"
                    value={line.measuredLiters}
                    onChange={(e) =>
                      setLines(
                        lines.map((item, j) =>
                          j === index ? { ...item, measuredLiters: e.target.value } : item
                        )
                      )
                    }
                  />
                </Field>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {vi.common.cancel}
            </Button>
            <Button type="submit" loading={busy}>
              {vi.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
