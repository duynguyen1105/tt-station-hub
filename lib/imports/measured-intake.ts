import { z } from 'zod'

import { baremIntakeOf } from '@/lib/inventory/barem-form'

const baremSide = z.object({ baremLiters: z.number().nullish() }).catch({ baremLiters: null })

const tankChecks = z
  .array(z.object({ tankCode: z.string().nullish(), before: baremSide, after: baremSide }))
  .catch([])

/**
 * Hầm → litres it measured receiving on a saved biên bản: SL barem sau − trước from its
 * (c) section. A reference beside the booked Nhập vào sổ, never booked itself; a hầm
 * with no measured rise is absent.
 */
export function measuredIntakeByTank(receiptTankChecks: unknown): Map<string, number> {
  const out = new Map<string, number>()
  for (const t of tankChecks.parse(receiptTankChecks ?? [])) {
    const liters = baremIntakeOf(t.before.baremLiters ?? null, t.after.baremLiters ?? null)
    if (t.tankCode && liters !== null) out.set(t.tankCode, liters)
  }
  return out
}
