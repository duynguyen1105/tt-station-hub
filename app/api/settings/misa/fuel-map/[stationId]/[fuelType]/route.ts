import { z } from 'zod'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { hasRole } from '@/lib/auth/permissions'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { type StationFuelUsage, decideStationFuelRemoval } from '@/lib/fuels/catalogue'
import { bookSummary } from '@/lib/inventory/book-stock'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

type Params = { params: Promise<{ stationId: string; fuelType: string }> }

/**
 * A trạm with no số đầu kỳ for a nhiên liệu counts every movement it has, as Hàng tồn
 * does.
 */
const EPOCH = new Date(0)

/**
 * What the trạm still has for this nhiên liệu: every trụ pumping it, active or not, and
 * the lít its tồn kho stands at. Only the counting lives here — what the numbers mean is
 * `decideStationFuelRemoval`.
 *
 * The trụ come with their tên rather than as a count, because the refusal names them:
 * "Trụ 1, Trụ 4" is something kế toán can act on, "2 trụ" is not.
 *
 * The tồn kho is the sổ sách — đầu kỳ + nhập − xuất ± điều chỉnh — read exactly as the
 * Hàng tồn screen reads it, so the số lít the refusal names is the số lít kế toán is
 * looking at. `InventoryBalance.estimatedStock` is a running counter with no đầu kỳ
 * behind it and would answer a different question.
 */
async function countStationFuelUsage(
  stationId: string,
  fuelType: string
): Promise<StationFuelUsage> {
  const [dispensers, opening, movements] = await Promise.all([
    prisma.dispenser.findMany({
      where: { stationId, fuelType },
      select: { displayName: true, isActive: true },
      orderBy: { displayOrder: 'asc' },
    }),
    prisma.inventoryOpeningBalance.findUnique({
      where: { stationId_fuelType: { stationId, fuelType } },
      select: { openingLiters: true, effectiveDate: true },
    }),
    prisma.inventoryMovement.findMany({
      where: { stationId, fuelType },
      select: { movementType: true, quantity: true, movementDate: true },
    }),
  ])

  const { bookStock } = bookSummary(
    opening ? Number(opening.openingLiters) : 0,
    opening?.effectiveDate ?? EPOCH,
    movements.map((movement) => ({ ...movement, quantity: Number(movement.quantity) }))
  )
  return { dispensers, stock: bookStock }
}

/**
 * The row and the person asking, once they have been allowed to have it: signed in, of
 * a role that may configure a trạm, and phụ trách of this one. Both handlers start
 * here, so the read and the write are gated the same way.
 */
async function requireFuelMapEntry(stationId: string, fuelType: string) {
  const user = await getCurrentUser()
  if (!user) return { error: unauthorized() } as const
  if (!hasRole(user.role, ['admin', 'accountant'])) return { error: forbidden() } as const
  // An identifier that is not a UUID names no trạm, and reaches Prisma as a type error
  // rather than an empty result — so it is answered here, as a 404 like any other trạm
  // that does not exist.
  if (!z.string().uuid().safeParse(stationId).success) return { error: notFound() } as const
  if (!(await canReachStation(user, stationId))) return { error: forbidden() } as const

  const entry = await prisma.misaFuelMap.findUnique({
    where: { stationId_fuelType: { stationId, fuelType } },
  })
  if (!entry) return { error: notFound() } as const
  return { user, entry } as const
}

/**
 * What pressing Xóa khỏi trạm on this row would do — the question the dialog asks
 * before it offers a button, so kế toán reads the trụ and the số lít standing in the
 * way instead of a refusal after the fact.
 */
export async function GET(_req: Request, { params }: Params) {
  const { stationId, fuelType } = await params
  const loaded = await requireFuelMapEntry(stationId, fuelType)
  if ('error' in loaded) return loaded.error

  return ok(decideStationFuelRemoval(await countStationFuelUsage(stationId, fuelType)))
}

/**
 * The trạm stops selling this nhiên liệu: its Map nhiên liệu row goes, and with it the
 * declaration. Nothing else moves — ca, phiếu nhập, đo hầm and công nợ store the khóa
 * and read their tên back through the danh mục.
 *
 * The blockers are counted again here rather than trusted from the dialog: a trụ put
 * back into service, or a nhập written since the dialog opened, has to stop the removal
 * it would otherwise have been waved through.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { stationId, fuelType } = await params
  const loaded = await requireFuelMapEntry(stationId, fuelType)
  if ('error' in loaded) return loaded.error
  const { user, entry } = loaded

  const removal = decideStationFuelRemoval(await countStationFuelUsage(stationId, fuelType))
  if (removal.kind === 'blocked') {
    // Named by its tên, not its khóa — the refusal is Vietnamese kế toán read. A khóa
    // the danh mục no longer answers for falls back to itself, as everywhere else.
    const fuel = await prisma.fuel.findUnique({ where: { fuelType }, select: { name: true } })
    // The reasons are in the message and not only in `details`, because that is what a
    // toast shows — and the message ends in a colon that has to be followed by them.
    return badRequest(
      `${vi.misaSettings.removeFuelMapBlocked(fuel?.name ?? fuelType)} ${removal.reasons.join('; ')}`,
      removal.reasons
    )
  }

  await prisma.misaFuelMap.delete({ where: { id: entry.id } })
  await writeAudit({
    userId: user.id,
    action: 'misa.fuel_map.delete',
    entity: 'misa_fuel_map',
    entityId: entry.id,
    // The whole row, because nothing else remembers what mã hàng this trạm filed the
    // nhiên liệu under once the row is gone.
    metadata: {
      stationId,
      fuelType,
      productCode: entry.productCode,
      productName: entry.productName,
      warehouseCode: entry.warehouseCode,
      unit: entry.unit,
    },
  })
  return ok({ stationId, fuelType })
}
