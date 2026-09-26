// Why a ca cannot be chốt'd yet. Pure — the ca's số liệu in, a refusal or null out — so
// the disabled Chốt ca button and the endpoint behind it always give the same reason.
//
// The refusals are Vietnamese here rather than in the route, in the style of
// lib/dispensers/rules.ts: when a ca may close is a fact of the rule, not of the screen.
import { Prisma } from '@/lib/generated/prisma/client'
import { vi } from '@/messages/vi'

/** A ca's số liệu in the one part chốt weighs: where it stands with the kế toán. */
export type ReviewedReading = { reviewStatus: string }

/**
 * The review states of a số liệu that counts toward the ca — the rows chốt turns into a
 * trừ kho, and the closings the next ca opens from. A `rejected` row is not one: it is
 * a number that was looked at and thrown away, so it weighs nothing.
 */
export const APPROVED_REVIEW_STATUSES = ['approved', 'auto_approved', 'corrected'] as const

/** The review states of a số liệu still waiting on the kế toán — nobody has said yes or no yet. */
export const PENDING_REVIEW_STATUSES = ['pending', 'needs_review'] as const

export function isApprovedReading(reading: ReviewedReading): boolean {
  return (APPROVED_REVIEW_STATUSES as readonly string[]).includes(reading.reviewStatus)
}

/**
 * Why this ca cannot be chốt'd, or null when it can.
 *
 * **Số liệu chưa duyệt** is the older refusal and is spoken first: a number nobody has
 * looked at must not be turned into a trừ kho.
 *
 * **No số liệu that counts** is refused because a chốt without sales posts
 * nothing to inventory and should not close the review workflow.
 */
export function refuseShiftCompletion(readings: readonly ReviewedReading[]): string | null {
  if (
    readings.some((r) => (PENDING_REVIEW_STATUSES as readonly string[]).includes(r.reviewStatus))
  ) {
    return vi.shifts.cannotCompletePending
  }
  if (!readings.some(isApprovedReading)) {
    return vi.shifts.cannotCompleteNoReadings
  }
  return null
}

/** Reverse the posted movements, not today's (possibly edited) readings. */
export function reversedShiftSales(
  movements: readonly { fuelType: string; quantity: Prisma.Decimal }[]
): { fuelType: string; liters: Prisma.Decimal }[] {
  const byFuel = new Map<string, Prisma.Decimal>()
  for (const movement of movements) {
    byFuel.set(
      movement.fuelType,
      (byFuel.get(movement.fuelType) ?? new Prisma.Decimal(0)).minus(movement.quantity)
    )
  }
  return [...byFuel].map(([fuelType, liters]) => ({ fuelType, liters }))
}
