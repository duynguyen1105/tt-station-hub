// Decides which route an incoming Zalo photo takes — a shift-closing photo, a
// per-trip debt fill or an inventory dip (build plan §6) — and what that route
// implies for the day's ca. Default is shift.
import type { ExtractVisitResult, RouterResult } from '@/lib/ai/types'
import type { DebtPhotoType } from '@/lib/photos/ingest'

export type PhotoRoute = 'shift' | 'debt' | 'inventory'

/**
 * The intent EXPLICITLY typed by the sender, or null when the caption doesn't
 * declare one. An explicit caption is AUTHORITATIVE — it overrides whatever the
 * image classifier thinks (a green totalizer and a debt display are the same
 * physical screen, so vision alone can never separate them 100%).
 */
export function explicitCaptionKind(caption: string | null | undefined): PhotoRoute | null {
  if (!caption) return null
  const normalized = caption.toLowerCase()
  if (
    /\bxe\b/.test(normalized) ||
    normalized.includes('công nợ') ||
    normalized.includes('cong no')
  ) {
    return 'debt'
  }
  if (normalized.includes('chốt') || normalized.includes('chot')) return 'shift'
  if (
    normalized.includes('tồn kho') ||
    normalized.includes('ton kho') ||
    normalized.includes('kiểm kê') ||
    normalized.includes('kiem ke') ||
    // Staff say "đo bồn" / "đo hầm" for a dip measurement — same declaration.
    normalized.includes('đo bồn') ||
    normalized.includes('do bon') ||
    normalized.includes('đo hầm') ||
    normalized.includes('do ham')
  ) {
    return 'inventory'
  }
  return null
}

/**
 * Final route for a single photo, combining what the AI sees in the image with the
 * sender's declarations. Precedence, strongest first:
 *
 * 1. The caption typed on THIS message — the human declared the intent for every
 *    photo in it, so the image classifier cannot override it.
 * 2. A clear image classification: a vehicle plate or a transaction display is a
 *    debt fill, a HẦM tank-dip is inventory.
 * 3. A REMEMBERED declaration (the sender's recent text, not this message's own
 *    caption) decides the cases vision cannot — a green totalizer and a debt
 *    display are the same physical screen, and an unreadable photo is nothing —
 *    but never overrides (2): a "công nợ" text must not turn the dip photos sent
 *    minutes later into debts.
 * 4. Shift.
 *
 * `routerType` is null when classification failed outright.
 */
export function routePhoto(
  routerType: RouterResult['image_type'] | null,
  captionKind: PhotoRoute | null,
  declaredFallback: PhotoRoute | null = null
): PhotoRoute {
  if (captionKind) return captionKind
  switch (routerType) {
    case 'vehicle':
    case 'debt_meter':
      return 'debt'
    case 'tank_dip':
      return 'inventory'
    case 'electronic_meter':
    case 'mechanical_meter':
      return declaredFallback === 'debt' ? 'debt' : 'shift'
    default:
      // 'label_only' | 'not_relevant' | null — trust the remembered intent.
      return declaredFallback ?? 'shift'
  }
}

/**
 * Which half of a lượt xe a debt-routed photo is, from the image alone. Null for
 * an image that is neither half — a bare label plate, a tank plate, something
 * unrelated, or a photo the router could not classify. Such a photo must never
 * open or fill a pump half on the strength of a declaration: the fake half
 * steals the pairing slot of the real pump photo (the vehicle then shows
 * "Không có ảnh") and, when the plate names a trạm, drags the visit there. The
 * caller may still promote it to a pump half once the visit reader has proven
 * it one (`reconcilesAsPerFillDisplay`).
 */
export function debtHalfFor(routerType: RouterResult['image_type'] | null): DebtPhotoType | null {
  switch (routerType) {
    case 'vehicle':
      return 'vehicle'
    case 'debt_meter':
    // A totalizer look-alike under a debt declaration: the one pair vision alone
    // cannot separate, so the declaration decides.
    case 'electronic_meter':
    case 'mechanical_meter':
      return 'debt_meter'
    default:
      return null
  }
}

/**
 * Whether the visit reader proved the photo is a per-fill display: the three
 * lines it read satisfy TIỀN = LÍT × ĐƠN GIÁ at some decimal scale. A cumulative
 * totalizer has no money line to reconcile against, so this is the one signal
 * that separates the two look-alike screens after the fact.
 */
export function reconcilesAsPerFillDisplay(meter: ExtractVisitResult): boolean {
  return meter.meterType === 'debt_meter' && meter.amountMatchesDisplay === true
}

/**
 * Whether a photo on this route opens the day's ca (GMT+7) when the trạm has none
 * yet. An ảnh trụ bơm always has; an ảnh công nợ does too, so a morning of bán nợ
 * before any meter photo produces lượt xe that have a ca to be listed in — the
 * charge is written the moment a kế toán duyệt, and it must be viewable.
 *
 * Ảnh nhập hàng are deliberately left out: a đo hầm photo on a day with no other
 * photos still opens nothing.
 */
export function routeOpensShift(route: PhotoRoute): boolean {
  return route === 'shift' || route === 'debt'
}
