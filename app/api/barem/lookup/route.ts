import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, ok, serverError, unauthorized } from '@/lib/api/response'
import { hasRole } from '@/lib/auth/permissions'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { type BaremLookupResult, lookupBaremLiters } from '@/lib/inventory/barem'
import { fetchBaremSheet } from '@/lib/inventory/barem-fetch'
import { baremSheetFor } from '@/lib/inventory/barem-sheets'
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
 * Resolves a batch of (Hầm, chiều cao) pairs against Trường Thịnh's Barem
 * spreadsheet — the litres, or the reason there are none. The sheet is read
 * live, on every request and with nothing cached (ADR 0005), so an admin's
 * correction applies to the very next height typed. One tab covers every Hầm at
 * the Trạm, so the whole batch costs one fetch.
 *
 * A Trạm with no Barem and a Hầm the sheet does not have answer the same way
 * ("unknown-tank"), so the form has one failure path to explain rather than
 * four.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!hasRole(user.role, ['admin', 'accountant'])) return forbidden()

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  const { stationId, heights } = parsed.data
  if (!(await canReachStation(user, stationId))) return forbidden()

  const station = await prisma.station.findUnique({
    where: { id: stationId },
    select: { code: true },
  })
  // An unmapped Trạm answers exactly as an unknown Hầm does — the safe failure
  // it gave before this endpoint read the sheet — rather than as a sheet that
  // could not be read.
  const binding = baremSheetFor(station?.code)
  if (!binding) return ok(refuseAll(heights))

  const read = await fetchBaremSheet(binding)
  if (!read.ok) {
    // Unreadable takes out every Hầm at the Trạm at once, so the endpoint fails
    // rather than inventing a per-row reason. The form turns this into its
    // "enter by hand" banner and forgets the batch, so a corrected height asks
    // again and a transient failure clears itself.
    console.error(`barem: ${binding.tab} — ${read.error}`)
    return serverError()
  }

  const columns = new Map(read.sheet.tanks.map((tank) => [tank.tankCode, tank]))
  const results: BaremLookupResult[] = heights.map((h) => ({
    tankCode: h.tankCode,
    heightMm: h.heightMm,
    ...lookupBaremLiters(columns.get(h.tankCode), h.heightMm),
  }))
  return ok(results)
}

function refuseAll(heights: { tankCode: string; heightMm: number }[]): BaremLookupResult[] {
  return heights.map((h) => ({ ...h, ok: false, reason: 'unknown-tank' }))
}
