// Decides which route an incoming Zalo photo takes — a shift-closing photo, a
// per-trip debt fill or an inventory dip (build plan §6) — and what that route
// implies for the day's ca. Default is shift.
import type { RouterResult } from '@/lib/ai/types'

export type ZaloMessageKind = 'shift' | 'debt'
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

export function classifyZaloMessage(caption: string | null | undefined): ZaloMessageKind {
  if (!caption) return 'shift'
  const normalized = caption.toLowerCase()
  // Debt fills are captioned with a customer/vehicle ("Xe ...") or a keyword.
  if (
    /\bxe\b/.test(normalized) ||
    normalized.includes('công nợ') ||
    normalized.includes('cong no')
  ) {
    return 'debt'
  }
  return 'shift'
}

/**
 * Final route for a single photo, combining what the AI sees in the image with the
 * message caption. The image content is authoritative for clear cases (a vehicle
 * plate or a transaction display is always a debt fill; a cumulative totalizer is a
 * shift reading; a HẦM tank-dip is inventory). When the image is ambiguous
 * (unclear / label-only / unrelated) we fall back to the caption's intent, so a blurry
 * debt photo captioned "công nợ" still routes to debt. This is why captions AND
 * content-detection both work — captions are the hint, content is the decider.
 */
export function routePhoto(
  routerType: RouterResult['image_type'],
  captionKind: ZaloMessageKind,
  // A REMEMBERED declaration (the sender's recent text, not this message's own
  // caption). Weaker than an explicit caption: it hints where ambiguity falls,
  // but a clear image classification (a tank dip, a vehicle) still wins — a
  // "công nợ" text must not turn the dip photos sent minutes later into debts.
  declaredFallback: PhotoRoute | null = null
): PhotoRoute {
  switch (routerType) {
    case 'vehicle':
    case 'debt_meter':
      return 'debt'
    case 'tank_dip':
      return 'inventory'
    case 'electronic_meter':
    case 'mechanical_meter':
      // A shift totalizer — unless the sender declared these photos are debt
      // fills (the one pair vision alone can never separate).
      return captionKind === 'debt' || declaredFallback === 'debt' ? 'debt' : 'shift'
    default:
      // 'label_only' | 'not_relevant' — trust the declared intent (defaults to shift).
      return declaredFallback ?? captionKind
  }
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
