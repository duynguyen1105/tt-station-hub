import { Prisma } from '@/lib/generated/prisma/client'

type Movement = { fuelType: string; quantity: Prisma.Decimal | number | string }

/** Reverse the old movement, then post its replacement, coalescing a same-fuel edit. */
export function manualMovementDeltas(old: Movement, next: Movement | null) {
  const deltas = new Map<string, Prisma.Decimal>()
  deltas.set(old.fuelType, new Prisma.Decimal(old.quantity).negated())
  if (next) {
    deltas.set(
      next.fuelType,
      (deltas.get(next.fuelType) ?? new Prisma.Decimal(0)).plus(next.quantity)
    )
  }
  return [...deltas].filter(([, delta]) => !delta.isZero())
}

/** Source references mark movements owned by shift close, import and import cancellation. */
export function isManualMovement(row: { sourceRef: string | null; createdBy: string | null }) {
  return row.sourceRef === null && row.createdBy !== null
}
