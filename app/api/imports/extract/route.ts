import { type NextRequest } from 'next/server'

import { extractBienBan } from '@/lib/ai/extract-bien-ban'
import { badRequest, forbidden, ok, unauthorized } from '@/lib/api/response'
import { getCurrentUser } from '@/lib/auth/session'
import { checkStationOnPaper } from '@/lib/imports/station-check'
import { vi } from '@/messages/vi'

// Vision extraction of a full biên bản can take well over the default limit.
export const maxDuration = 120

/**
 * Reads uploaded biên bản giao nhận photo(s) with Claude Vision and returns
 * the structured extraction that pre-fills the review form. Nothing is
 * persisted here — the photos are re-sent on confirm so an abandoned wizard
 * leaves no orphans.
 *
 * Alongside it goes `stationCheck`: whether the header names the Trạm this
 * import is being made into (ADR 0006). It is returned beside the extraction
 * rather than inside it, so `raw_extract` keeps holding only what the AI read.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role === 'viewer') return forbidden()

  const form = await req.formData().catch(() => null)
  if (!form) return badRequest()
  const files = form.getAll('photos').filter((f): f is File => f instanceof File)
  if (files.length === 0) return badRequest(vi.imports.noBienBanPhotos)
  const stationId = form.get('stationId')
  if (typeof stationId !== 'string' || stationId === '') return badRequest()

  const buffers = await Promise.all(
    files.map(async (file) => Buffer.from(await file.arrayBuffer()))
  )
  try {
    const extraction = await extractBienBan(buffers)
    const stationCheck = await checkStationOnPaper(stationId, extraction.stationName)
    return ok({ extraction, stationCheck })
  } catch {
    return badRequest(vi.imports.readFailed)
  }
}
