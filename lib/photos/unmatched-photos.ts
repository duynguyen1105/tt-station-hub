import type { RouterResult } from '@/lib/ai/types'
import type { Prisma } from '@/lib/generated/prisma/client'

/**
 * Why a photo is sitting on a ca without a trụ, beyond the ordinary "the AI could
 * not match the label". Written by intake into `ShiftPhoto.aiRawResponse` so the
 * reviewer sees it on the unmatched list and can gán the photo by hand.
 */
export type UnmatchedReason =
  // Sent under a debt declaration, but neither a vehicle nor a display whose
  // TIỀN = LÍT × ĐƠN GIÁ reconciles — parked on the ca instead of faking a half.
  | 'debt_unreconciled'
  // The AI pass threw; the photo would otherwise have vanished into a log line.
  | 'extraction_failed'

export const ROUTER_IMAGE_TYPES: readonly RouterResult['image_type'][] = [
  'electronic_meter',
  'mechanical_meter',
  'debt_meter',
  'vehicle',
  'tank_dip',
  'label_only',
  'not_relevant',
]

/** The ShiftPhoto columns that keep a photo visible in its ca's unmatched list, with why. */
export function unmatchedTrace(
  reason: UnmatchedReason,
  detail: { router: RouterResult | null; error?: unknown; visit?: unknown }
): Prisma.ShiftPhotoUpdateInput {
  const error =
    detail.error === undefined
      ? undefined
      : detail.error instanceof Error
        ? detail.error.message
        : String(detail.error)
  return {
    aiProcessedAt: new Date(),
    matchStatus: 'unmatched',
    aiRawResponse: {
      reason,
      router: detail.router,
      ...(error === undefined ? {} : { error }),
      ...(detail.visit === undefined ? {} : { visit: detail.visit }),
    } as Prisma.InputJsonValue,
  }
}

export type UnmatchedPhotoTrace = {
  reason: UnmatchedReason | null
  routerType: RouterResult['image_type'] | null
  /** What the AI said about the frame — the reader's notes, else the router's. */
  notes: string | null
  error: string | null
}

/**
 * Reads the trace back out of `aiRawResponse`, whichever pass wrote it: the
 * shift reader (`{ router, extraction }`), the visit reader, or `unmatchedTrace`.
 */
export function unmatchedPhotoTrace(raw: unknown): UnmatchedPhotoTrace {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const router =
    obj.router && typeof obj.router === 'object' ? (obj.router as Record<string, unknown>) : null
  const extraction =
    obj.extraction && typeof obj.extraction === 'object'
      ? (obj.extraction as Record<string, unknown>)
      : null
  const reason = obj.reason
  const routerType = router?.image_type
  const notes = extraction?.notes ?? router?.notes ?? obj.notes
  return {
    reason: reason === 'debt_unreconciled' || reason === 'extraction_failed' ? reason : null,
    routerType:
      typeof routerType === 'string' &&
      (ROUTER_IMAGE_TYPES as readonly string[]).includes(routerType)
        ? (routerType as RouterResult['image_type'])
        : null,
    notes: typeof notes === 'string' && notes.trim() ? notes : null,
    error: typeof obj.error === 'string' ? obj.error : null,
  }
}
