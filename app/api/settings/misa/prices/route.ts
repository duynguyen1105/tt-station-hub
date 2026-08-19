import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, created, forbidden, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { hasRole } from '@/lib/auth/permissions'
import { getCurrentUser } from '@/lib/auth/session'
import { FuelArea } from '@/lib/generated/prisma/client'
import { planKyPriceSave } from '@/lib/misa-export/retail-price-board'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

// One kỳ điều chỉnh giá: a single ngày áp dụng carrying a cell per nhiên liệu per
// vùng. A null cell is one kế toán left blank — that fuel's price did not move. A null
// fuelArea is a nhiên liệu priced the same everywhere, keyed once and written to both.
const kySchema = z.object({
  effectiveDate: z.coerce.date(),
  cells: z.array(
    z.object({
      fuelArea: z.nativeEnum(FuelArea).nullable(),
      fuelType: z.string().min(1),
      unitPrice: z.number().positive().nullable(),
    })
  ),
})

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!hasRole(user.role, ['admin', 'accountant'])) return forbidden()

  const parsed = kySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  const { effectiveDate, cells } = parsed.data

  // Which nhiên liệu may be priced is the danh mục's answer, not a list in this file:
  // one added this morning has to be priceable the same afternoon. A khóa nobody sells
  // is refused rather than written, because every reader downstream would find a giá
  // for a nhiên liệu that does not exist.
  const catalogue = await prisma.fuel.findMany({
    select: { fuelType: true, name: true, isActive: true },
  })
  const byFuelType = new Map(catalogue.map((fuel) => [fuel.fuelType, fuel]))
  const unknown = cells.find((cell) => !byFuelType.has(cell.fuelType))
  if (unknown) return badRequest(vi.misaSettings.unknownFuel(unknown.fuelType))

  // A nhiên liệu đã ngừng keeps every giá it ever had and gets no new one. Only a cell
  // carrying a price is refused: a blank one writes nothing, and a kỳ keyed on a page
  // opened before the nhiên liệu was stopped should not lose the four prices beside it.
  const stopped = cells
    .filter((cell) => cell.unitPrice !== null)
    .map((cell) => byFuelType.get(cell.fuelType))
    .find((fuel) => !fuel?.isActive)
  if (stopped) return badRequest(vi.misaSettings.inactiveFuel(stopped.name))

  // A date that already carries a kỳ is edited, not rejected: the rows on that date
  // are what tells planKyPriceSave which cells update rather than create.
  const existing = await prisma.misaRetailPrice.findMany({ where: { effectiveDate } })
  const plan = planKyPriceSave(
    existing.map((price) => ({
      id: price.id,
      fuelArea: price.fuelArea,
      fuelType: price.fuelType,
      effectiveDate: price.effectiveDate,
      unitPrice: Number(price.unitPrice),
    })),
    effectiveDate,
    cells
  )

  // All or nothing — a rejected cell must never leave half a kỳ written, and each row's
  // audit entry commits with the row it describes rather than after it.
  const written = await prisma.$transaction(async (tx) => {
    const rows = []
    for (const op of plan) {
      const row =
        op.kind === 'create'
          ? await tx.misaRetailPrice.create({
              data: {
                fuelArea: op.fuelArea,
                fuelType: op.fuelType,
                effectiveDate,
                unitPrice: op.unitPrice,
              },
            })
          : await tx.misaRetailPrice.update({
              where: { id: op.id },
              data: { unitPrice: op.unitPrice },
            })
      await writeAudit(
        {
          userId: user.id,
          action: `misa.retail_price.${op.kind}`,
          entity: 'misa_retail_price',
          entityId: row.id,
          metadata: {
            fuelArea: op.fuelArea,
            fuelType: op.fuelType,
            effectiveDate,
            unitPrice: op.unitPrice,
            ...(op.kind === 'update' && { previousUnitPrice: op.previousUnitPrice }),
          },
        },
        tx
      )
      rows.push(row)
    }
    return rows
  })

  return created({ written: written.length })
}
