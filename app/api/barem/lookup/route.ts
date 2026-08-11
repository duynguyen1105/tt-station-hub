import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, ok, unauthorized } from '@/lib/api/response'
import { hasRole } from '@/lib/auth/permissions'
import { getCurrentUser } from '@/lib/auth/session'
import { type BaremLookupResult, lookupBaremLiters } from '@/lib/inventory/barem'
import { prisma } from '@/lib/prisma'

/** One review form holds a handful of Hầm, before and after — never more. The
 *  cap is what keeps this a lookup rather than a way to pull a station's whole
 *  Barem (thousands of points per tank) into the browser. */
const MAX_HEIGHTS = 40

const bodySchema = z.object({
  stationId: z.string().uuid(),
  heights: z
    .array(
      z.object({
        tankCode: z.string().trim().min(1),
        // The Barem is a table of whole millimetres; a measured fraction is
        // rounded by the caller so the answer is about the height asked for.
        heightMm: z.number().int(),
      })
    )
    .min(1)
    .max(MAX_HEIGHTS),
})

/**
 * Resolves a batch of (Hầm, chiều cao) pairs against a Trạm's stored Barem —
 * the litres, or the reason there are none. A Trạm with no Barem and a Hầm the
 * sheet does not have answer the same way ("unknown-tank"), so the form has one
 * failure path to explain rather than four.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!hasRole(user.role, ['admin', 'accountant'])) return forbidden()

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  const { stationId, heights } = parsed.data

  const tankCodes = [...new Set(heights.map((h) => h.tankCode))]
  const [tanks, points] = await Promise.all([
    prisma.baremTank.findMany({
      where: { stationId, tankCode: { in: tankCodes } },
      select: { tankCode: true, minHeightMm: true, maxHeightMm: true },
    }),
    // Only the points actually asked about: the range check comes from the
    // tank's own metadata, so nothing else needs to leave the database.
    prisma.baremPoint.findMany({
      where: {
        OR: heights.map((h) => ({ stationId, tankCode: h.tankCode, heightMm: h.heightMm })),
      },
      select: { tankCode: true, heightMm: true, liters: true },
    }),
  ])

  const columns = new Map(
    tanks.map((tank) => [
      tank.tankCode,
      {
        minHeightMm: tank.minHeightMm,
        maxHeightMm: tank.maxHeightMm,
        points: new Map<number, number>(),
      },
    ])
  )
  for (const point of points) columns.get(point.tankCode)?.points.set(point.heightMm, point.liters)

  const results: BaremLookupResult[] = heights.map((h) => ({
    tankCode: h.tankCode,
    heightMm: h.heightMm,
    ...lookupBaremLiters(columns.get(h.tankCode), h.heightMm),
  }))
  return ok(results)
}
