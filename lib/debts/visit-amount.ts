import { vi } from '@/messages/vi'

/**
 * What a lượt bán nợ charges, and the rules a người duyệt's hand-typed thành tiền
 * has to keep.
 *
 * Pure — values in, a refusal or the fields to write out — so the Sửa số dialog and
 * the route behind it cannot drift on what a valid thành tiền is. The refusals are
 * Vietnamese here rather than in the route: what may be charged is a fact of the
 * rule, not of the screen.
 *
 * Two amounts live side by side on a visit and they mean different things:
 *   computedAmount — số lít × đơn giá, always derived, never typed. The Khớp/Lệch
 *                    check compares *this* against the pump display, so it stays a
 *                    statement about what the AI read.
 *   amountOverride — what the trạm actually charged, when the two disagree. Null
 *                    means the derived figure stands. This is what the ledger posts.
 */

/** Above this, a single lượt xe is a typo rather than a fill (a full tanker is ~1e8 đ). */
const MAX_AMOUNT = 1_000_000_000

export type VisitAmounts = {
  litersRead: number | null
  unitPriceRead: number | null
  amountOverride: number | null
}

/** Số lít × đơn giá, rounded to the đồng. The only place this product is spelled out. */
export function computedAmountOf(v: {
  litersRead: number | null
  unitPriceRead: number | null
}): number | null {
  if (v.litersRead === null || v.unitPriceRead === null) return null
  return Math.round(v.litersRead * v.unitPriceRead)
}

/** What the ledger charges: the typed thành tiền when there is one, else the derived. */
export function chargeAmountOf(v: VisitAmounts): number | null {
  return v.amountOverride ?? computedAmountOf(v)
}

/**
 * Why a typed thành tiền can't be written, or null when it can.
 *
 * Số lít is required even when the amount is typed: the MISA sales voucher and the
 * "Bán nợ trong ca" list both export số lít and never the amount, so a visit approved
 * on a total alone would leave a zero-quantity row behind it.
 */
export function refuseAmountOverride(v: VisitAmounts): string | null {
  const amount = v.amountOverride
  if (amount === null) return null
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
    return vi.debtReview.amountManualInvalid
  }
  if (amount > MAX_AMOUNT) return vi.debtReview.amountManualTooLarge
  if (v.litersRead === null) return vi.debtReview.amountManualNeedsLiters
  return null
}

/** Absent (field not sent) is distinct from null (field cleared) — see `nextAmountFields`. */
type Patch<T> = T | null | undefined

export type StoredAmounts = VisitAmounts & {
  originalLitersRead: number | null
  originalUnitPriceRead: number | null
}

export type NextAmountFields = VisitAmounts & {
  computedAmount: number | null
  /** Present only when this write is the one that first moves the AI's value. */
  originalLitersRead?: number | null
  originalUnitPriceRead?: number | null
}

/**
 * Merge a correction into a visit's amounts.
 *
 * `undefined` means the caller didn't mention the field (the trạm ô chọn posts only a
 * stationId) and the stored value stands; `null` means the reviewer cleared the box.
 * Telling those apart matters: `??` would treat a cleared số lít as "unchanged" and
 * recompute thành tiền from a number no longer in the row.
 *
 * An override survives only as long as the numbers it was typed against. The dialog
 * shows số lít, đơn giá and thành tiền together, so an override sent with them is the
 * reviewer's current intent and wins. A số lít changed *without* one — which only a
 * caller other than the dialog can do — drops it, because a stale override silently
 * outranking a fresh reading would post a wrong charge to a ledger that has no undo.
 */
export function nextAmountFields(
  stored: StoredAmounts,
  patch: {
    litersRead?: Patch<number>
    unitPriceRead?: Patch<number>
    amountOverride?: Patch<number>
  }
): NextAmountFields {
  const litersRead = patch.litersRead !== undefined ? patch.litersRead : stored.litersRead
  const unitPriceRead =
    patch.unitPriceRead !== undefined ? patch.unitPriceRead : stored.unitPriceRead

  const readingChanged = litersRead !== stored.litersRead || unitPriceRead !== stored.unitPriceRead
  const amountOverride =
    patch.amountOverride !== undefined
      ? patch.amountOverride
      : readingChanged
        ? null
        : stored.amountOverride

  const next: NextAmountFields = {
    litersRead,
    unitPriceRead,
    amountOverride,
    computedAmount: computedAmountOf({ litersRead, unitPriceRead }),
  }

  // Keep what the AI read the first time a reviewer actually moves it — stamping on
  // every save would record the AI's own value as its "original" and say nothing.
  if (stored.originalLitersRead === null && litersRead !== stored.litersRead) {
    next.originalLitersRead = stored.litersRead
  }
  if (stored.originalUnitPriceRead === null && unitPriceRead !== stored.unitPriceRead) {
    next.originalUnitPriceRead = stored.unitPriceRead
  }
  return next
}
