// Decides whether an incoming Zalo photo is a shift-closing photo or a per-trip
// debt fill, based on its caption (build plan §6). Default is shift.

export type ZaloMessageKind = 'shift' | 'debt'

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
