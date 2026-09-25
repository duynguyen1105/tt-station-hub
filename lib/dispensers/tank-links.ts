// Which hầm a trụ draws from, read through DispenserTank. A trụ may draw from several
// hầm (all holding the nhiên liệu it pumps) or from none (a URE trụ on a bồn rời).
import { tankNumberFrom } from '@/lib/dispensers/naming'
import type { Prisma } from '@/lib/generated/prisma/client'

/** Add to a `prisma.dispenser.findMany` to read each trụ's hầm. */
export const withTanks = {
  tankLinks: {
    select: { tank: { select: { id: true, code: true, fuelType: true, capacityK: true } } },
  },
} satisfies Prisma.DispenserInclude

export type LinkedTank = { id: string; code: string; fuelType: string; capacityK: number | null }

/** Hầm 2 before Hầm 10: by số hầm, then by code for one carrying no số. */
export function byTankCode(a: string, b: string): number {
  const na = tankNumberFrom(a) ?? Infinity
  const nb = tankNumberFrom(b) ?? Infinity
  return na === nb ? a.localeCompare(b) : na - nb
}

/** The hầm a trụ draws from, in số hầm order; empty for a trụ with none. */
export function tanksOf(dispenser: { tankLinks: readonly { tank: LinkedTank }[] }): LinkedTank[] {
  return dispenser.tankLinks.map((l) => l.tank).sort((a, b) => byTankCode(a.code, b.code))
}

/** The codes ("HAM_3") of the hầm a trụ draws from, in số hầm order. */
export function tankCodesOf(dispenser: { tankLinks: readonly { tank: LinkedTank }[] }): string[] {
  return tanksOf(dispenser).map((t) => t.code)
}
