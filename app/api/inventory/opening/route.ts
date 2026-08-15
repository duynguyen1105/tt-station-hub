import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'

const bodySchema = z.object({
  stationId: z.string().uuid(),
  fuelType: z.string().trim().min(1),
  openingLiters: z.coerce.number().min(0),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

/**
 * Sets Trường Thịnh's opening stock (số đầu kỳ) for one fuel at one station —
 * the anchor the book stock counts from. ADMIN ONLY: changing it re-anchors
 * the whole ledger, so it is audited with the previous value.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  const data = parsed.data

  const station = await prisma.station.findFirst({
    where: { id: data.stationId, isActive: true },
    select: { id: true },
  })
  if (!station) return badRequest('Trạm không hợp lệ.')

  const previous = await prisma.inventoryOpeningBalance.findUnique({
    where: { stationId_fuelType: { stationId: data.stationId, fuelType: data.fuelType } },
  })
  const row = await prisma.inventoryOpeningBalance.upsert({
    where: { stationId_fuelType: { stationId: data.stationId, fuelType: data.fuelType } },
    create: {
      stationId: data.stationId,
      fuelType: data.fuelType,
      openingLiters: data.openingLiters,
      effectiveDate: new Date(`${data.effectiveDate}T00:00:00.000Z`),
      setBy: user.id,
    },
    update: {
      openingLiters: data.openingLiters,
      effectiveDate: new Date(`${data.effectiveDate}T00:00:00.000Z`),
      setBy: user.id,
    },
  })

  await writeAudit({
    userId: user.id,
    action: 'inventory_opening.set',
    entity: 'inventory_opening_balance',
    entityId: row.id,
    metadata: {
      stationId: data.stationId,
      fuelType: data.fuelType,
      openingLiters: data.openingLiters,
      effectiveDate: data.effectiveDate,
      previous: previous
        ? {
            openingLiters: Number(previous.openingLiters),
            effectiveDate: previous.effectiveDate.toISOString().slice(0, 10),
          }
        : null,
    },
  })
  return ok({ id: row.id })
}
