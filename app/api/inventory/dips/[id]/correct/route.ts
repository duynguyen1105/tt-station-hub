import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { stationFuelRefusal } from '@/lib/fuels/load-catalogue'
import { parseVnNumber } from '@/lib/imports/bien-ban'
import { applyDipCorrection } from '@/lib/inventory/apply-dip-correction'
import { canCorrectTankDip } from '@/lib/inventory/dip-review'
import { stationTankRefusal } from '@/lib/inventory/station-tanks'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

// One field per cell, each optional: a người duyệt repairs the hầm, its nhiên
// liệu or the số đo one click at a time, and a payload naming none of them is a
// bug rather than an empty edit.
//
// dipValue is a string, not a number: the typed value goes through the same
// parser that read the dip photo, so "1.037" means 1037 millimetres here exactly
// as it did in the AI's overlay read instead of collapsing to 1.037.
const correctDipSchema = z
  .object({
    dipValue: z.string().optional(),
    tankCode: z.string().optional(),
    fuelType: z.string().optional(),
  })
  .refine((body) => Object.values(body).some((field) => field !== undefined))

/**
 * Repairs what the AI misread off a hầm plate before anyone decides on it — the
 * hầm, its nhiên liệu, the số đo. Admin or kế toán, at the đo hầm's own trạm, and
 * only while the row is still chờ xử lý — see `canCorrectTankDip`. Re-derives "So
 * với lần trước", the hầm dự phòng flag and both hầm's chains from the shared
 * rule, so a repaired dip reads exactly like a correct AI read.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params

  const parsed = correctDipSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())

  const dip = await prisma.tankDipRecord.findUnique({ where: { id } })
  if (!dip) return notFound()
  // The đo hầm's own trạm decides, not the screen the row was reached from.
  if (!(await canReachStation(user, dip.stationId))) return forbidden()
  if (!canCorrectTankDip(user.role, dip.reviewStatus)) return forbidden()

  const { dipValue: typed, tankCode, fuelType } = parsed.data

  // A dip-stick height is never negative, and a blank box is a mistake rather
  // than an instruction to zero the hầm.
  let dipValue: number | undefined
  if (typed !== undefined) {
    const parsedDip = parseVnNumber(typed)
    if (parsedDip === null || parsedDip < 0) return badRequest(vi.inventory.invalidDipValue)
    dipValue = parsedDip
  }

  // A hầm or a nhiên liệu no ô chọn offered is turned away rather than written —
  // the same rule the picker draws.
  const refusal = (
    await Promise.all([
      tankCode === undefined ? null : stationTankRefusal(dip.stationId, tankCode),
      fuelType === undefined ? null : stationFuelRefusal(dip.stationId, fuelType),
    ])
  ).find((message) => message !== null)
  if (refusal) return badRequest(refusal)

  const updated = await applyDipCorrection({
    dip,
    dipValue,
    tankCode,
    fuelType,
    userId: user.id,
  })
  return ok(updated)
}
