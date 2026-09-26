import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { stationFuelRefusal } from '@/lib/fuels/load-catalogue'
import { type Prisma } from '@/lib/generated/prisma/client'
import { importStockDeltas } from '@/lib/imports/reconcile'
import { rosterForStation } from '@/lib/imports/station-rosters'
import { shiftDateFor } from '@/lib/photos/ingest'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

const optionalText = z
  .string()
  .nullish()
  .transform((v) => v?.trim() || null)
const liters = z.number().finite().positive().max(999_999_999_999).multipleOf(0.001)
const measurement = z
  .number()
  .finite()
  .nonnegative()
  .max(999_999_999_999)
  .multipleOf(0.001)
  .nullable()
const payloadSchema = z.object({
  importedAt: z.coerce.date(),
  staffName: optionalText,
  driverName: optionalText,
  truckPlate: optionalText,
  vehicleCheck: optionalText,
  sealNo: optionalText,
  note: optionalText,
  invoiceNo: optionalText, // receipts with no goods columns can still have a document number
  products: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      warehouse: optionalText,
      exportSlipNo: optionalText,
    })
  ),
  lines: z.array(
    z.object({
      id: z.string().uuid(),
      tankIndex: z.number().int().nonnegative(),
      tankCode: z.string().min(1),
      litersActual: liters,
      beforeBaremLiters: measurement,
      measuredLiters: measurement,
    })
  ),
})

type JsonRow = Record<string, unknown>
const jsonRows = (value: unknown): JsonRow[] | null =>
  Array.isArray(value) &&
  value.every((v) => v !== null && typeof v === 'object' && !Array.isArray(v))
    ? (value as JsonRow[])
    : null

/** Editing the saved paper and its booked rows never creates a second import movement. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return badRequest()
  const parsed = payloadSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  const data = parsed.data

  const receipt = await prisma.fuelImportReceipt.findUnique({ where: { id } })
  if (!receipt) return notFound()
  if (!(await canReachStation(user, receipt.stationId))) return forbidden()
  const station = await prisma.station.findUnique({
    where: { id: receipt.stationId },
    select: { code: true },
  })
  if (!station) return notFound()
  const configured = await prisma.tank.findMany({
    where: { stationId: receipt.stationId },
    select: { code: true, fuelType: true },
  })
  const offered = new Map(
    rosterForStation(station.code)?.tanks.map((t) => [t.tankCode, t.fuel]) ?? []
  )
  for (const tank of configured) if (tank.fuelType) offered.set(tank.code, tank.fuelType)
  const existingLines = await prisma.fuelImport.findMany({
    where: { receiptId: id },
    select: { id: true, tankCode: true, fuelType: true },
  })

  // A moved hầm's fuel is server-derived; clients cannot retag liters to an arbitrary fuel.
  for (const line of data.lines) {
    const fuel = offered.get(line.tankCode)
    if (!fuel) return badRequest(vi.imports.selectTank)
    if (
      !existingLines.some(
        (old) => old.id === line.id && old.tankCode === line.tankCode && old.fuelType === fuel
      )
    ) {
      const refusal = await stationFuelRefusal(receipt.stationId, fuel)
      if (refusal) return badRequest(refusal)
    }
    if (line.measuredLiters !== null && line.beforeBaremLiters === null)
      return badRequest(vi.imports.measuredNeedsBefore)
  }

  return prisma.$transaction(async (tx) => {
    // Serialize two editors on the parent, then re-read all child rows under the lock.
    await tx.$queryRaw`SELECT id FROM fuel_import_receipts WHERE id = ${id}::uuid FOR UPDATE`
    const current = await tx.fuelImportReceipt.findUnique({ where: { id } })
    if (!current) return notFound()
    const children = await tx.fuelImport.findMany({ where: { receiptId: id } })
    if (children.some((row) => row.canceledAt)) return badRequest(vi.imports.editCancelled)
    if (
      children.length !== data.lines.length ||
      new Set(data.lines.map((line) => line.id)).size !== children.length
    )
      return badRequest(vi.imports.editChanged)
    const oldTanks = jsonRows(current.tankChecks ?? [])
    const oldProducts = jsonRows(current.products ?? [])
    if (!oldTanks || !oldProducts || oldProducts.length !== data.products.length)
      return badRequest(vi.imports.editChanged)
    if (
      new Set(data.lines.map((line) => line.tankIndex)).size !== data.lines.length ||
      new Set(data.products.map((p) => p.index)).size !== data.products.length ||
      data.products.some((p) => p.index >= oldProducts.length)
    )
      return badRequest(vi.imports.editChanged)
    const byId = new Map(children.map((row) => [row.id, row]))
    const movements = await tx.inventoryMovement.findMany({
      where: { movementType: 'import', sourceRef: { in: children.map((row) => row.id) } },
    })
    if (
      movements.length !== children.length ||
      new Set(movements.map((m) => m.sourceRef)).size !== movements.length
    )
      return badRequest(vi.imports.editChanged)
    const movementById = new Map(movements.map((m) => [m.sourceRef, m]))
    // Reject stale/mismatched lines before any writes, or a response could commit a partial edit.
    if (
      data.lines.some((line) => {
        const old = byId.get(line.id)
        const tank = oldTanks[line.tankIndex]
        return (
          !old ||
          !movementById.get(line.id) ||
          !tank ||
          tank.tankCode !== old.tankCode ||
          Number(tank.importedLiters) !== Number(old.litersActual)
        )
      })
    )
      return badRequest(vi.imports.editChanged)
    const nextProducts = oldProducts.map((row) => ({ ...row }))
    for (const product of data.products) {
      nextProducts[product.index] = {
        ...nextProducts[product.index],
        warehouse: product.warehouse,
        exportSlipNo: product.exportSlipNo,
      }
    }
    const supplier =
      [
        ...new Set(
          nextProducts
            .map((p) => p.warehouse)
            .filter((v): v is string => typeof v === 'string' && !!v)
        ),
      ].join(', ') || null
    const invoiceNo =
      nextProducts.length > 0
        ? [
            ...new Set(
              nextProducts
                .map((p) => p.exportSlipNo)
                .filter((v): v is string => typeof v === 'string' && !!v)
            ),
          ].join(', ') || null
        : data.invoiceNo
    const nextTanks = oldTanks.map((row) => ({ ...row }))
    const day = shiftDateFor(data.importedAt.getTime())
    const from = {
      receipt: {
        receiptDate: current.receiptDate,
        staffName: current.staffName,
        driverName: current.driverName,
        truckPlate: current.truckPlate,
        vehicleCheck: current.vehicleCheck,
        sealNo: current.sealNo,
        note: current.note,
        products: current.products,
        tankChecks: current.tankChecks,
      },
      lines: children.map((row) => ({
        id: row.id,
        tankCode: row.tankCode,
        fuelType: row.fuelType,
        litersActual: Number(row.litersActual),
        importedAt: row.importedAt,
        truckPlate: row.truckPlate,
        supplier: row.supplier,
        invoiceNo: row.invoiceNo,
      })),
    }
    for (const line of data.lines) {
      const old = byId.get(line.id)
      const tank = oldTanks[line.tankIndex]
      const movement = movementById.get(line.id)
      if (!old || !movement || !tank) return badRequest(vi.imports.editChanged)
      const fuelType = offered.get(line.tankCode)!
      const before =
        tank.before && typeof tank.before === 'object' && !Array.isArray(tank.before)
          ? (tank.before as JsonRow)
          : {}
      const after =
        tank.after && typeof tank.after === 'object' && !Array.isArray(tank.after)
          ? (tank.after as JsonRow)
          : {}
      nextTanks[line.tankIndex] = {
        ...tank,
        tankCode: line.tankCode,
        fuelType,
        importedLiters: line.litersActual,
        tankLabel:
          line.tankCode === old.tankCode ? tank.tankLabel : line.tankCode.replace('HAM_', 'Hầm '),
        before: { ...before, baremLiters: line.beforeBaremLiters },
        after: {
          ...after,
          baremLiters:
            line.measuredLiters === null
              ? line.beforeBaremLiters === null
                ? (after.baremLiters ?? null)
                : null
              : Math.round((line.beforeBaremLiters! + line.measuredLiters) * 1000) / 1000,
        },
      }
      await tx.fuelImport.update({
        where: { id: line.id },
        data: {
          tankCode: line.tankCode,
          fuelType,
          litersActual: line.litersActual,
          importedAt: data.importedAt,
          truckPlate: data.truckPlate,
          supplier,
          invoiceNo,
        },
      })
      await tx.inventoryMovement.update({
        where: { id: movement.id },
        data: {
          stationId: receipt.stationId,
          fuelType,
          quantity: line.litersActual,
          movementDate: day,
          note: invoiceNo ? `Nhập hàng — PXK ${invoiceNo}` : 'Nhập hàng (biên bản)',
        },
      })
      for (const delta of importStockDeltas(
        { stationId: old.stationId, fuelType: old.fuelType, liters: Number(old.litersActual) },
        { stationId: receipt.stationId, fuelType, liters: line.litersActual }
      )) {
        await tx.inventoryBalance.upsert({
          where: { stationId_fuelType: { stationId: delta.stationId, fuelType: delta.fuelType } },
          update: { estimatedStock: { increment: delta.liters } },
          create: {
            stationId: delta.stationId,
            fuelType: delta.fuelType,
            estimatedStock: delta.liters,
          },
        })
      }
    }
    await tx.fuelImportReceipt.update({
      where: { id },
      data: {
        receiptDate: data.importedAt,
        staffName: data.staffName,
        driverName: data.driverName,
        truckPlate: data.truckPlate,
        vehicleCheck: data.vehicleCheck,
        sealNo: data.sealNo,
        note: data.note,
        products: nextProducts as Prisma.InputJsonValue,
        tankChecks: nextTanks as Prisma.InputJsonValue,
      },
    })
    await writeAudit(
      {
        userId: user.id,
        action: 'fuel_import_receipt.update',
        entity: 'fuel_import_receipt',
        entityId: id,
        metadata: {
          from,
          to: {
            receipt: {
              receiptDate: data.importedAt,
              staffName: data.staffName,
              driverName: data.driverName,
              truckPlate: data.truckPlate,
              vehicleCheck: data.vehicleCheck,
              sealNo: data.sealNo,
              note: data.note,
              products: nextProducts,
              tankChecks: nextTanks,
            },
            lines: data.lines.map((line) => ({
              id: line.id,
              tankCode: line.tankCode,
              fuelType: offered.get(line.tankCode),
              litersActual: line.litersActual,
              importedAt: data.importedAt,
              truckPlate: data.truckPlate,
              supplier,
              invoiceNo,
            })),
          },
        },
      },
      tx
    )
    return ok({ id })
  })
}
