// Decides whether an incoming Zalo photo is a shift-closing photo or a per-trip
// debt fill, based on its caption (build plan §6). Default is shift.
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
    normalized.includes('kiem ke')
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
  captionKind: ZaloMessageKind
): PhotoRoute {
  switch (routerType) {
    case 'vehicle':
    case 'debt_meter':
      return 'debt'
    case 'tank_dip':
      return 'inventory'
    case 'electronic_meter':
    case 'mechanical_meter':
      // A shift totalizer — unless the sender explicitly captioned it as a debt fill.
      return captionKind === 'debt' ? 'debt' : 'shift'
    default:
      // 'label_only' | 'not_relevant' — trust the caption's intent (defaults to shift).
      return captionKind
  }
}
