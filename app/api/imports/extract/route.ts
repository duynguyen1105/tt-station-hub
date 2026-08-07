import { type NextRequest } from 'next/server'

import { extractBienBan } from '@/lib/ai/extract-bien-ban'
import { badRequest, forbidden, ok, unauthorized } from '@/lib/api/response'
import { getCurrentUser } from '@/lib/auth/session'
import { vi } from '@/messages/vi'

// Vision extraction of a full biên bản can take well over the default limit.
export const maxDuration = 120

/**
 * Reads uploaded biên bản giao nhận photo(s) with Claude Vision and returns
 * the structured extraction that pre-fills the review form. Nothing is
 * persisted here — the photos are re-sent on confirm so an abandoned wizard
 * leaves no orphans.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role === 'viewer') return forbidden()

  const form = await req.formData().catch(() => null)
  if (!form) return badRequest()
  const files = form.getAll('photos').filter((f): f is File => f instanceof File)
  if (files.length === 0) return badRequest(vi.imports.noBienBanPhotos)

  const buffers = await Promise.all(
    files.map(async (file) => Buffer.from(await file.arrayBuffer()))
  )
  try {
    const extraction = await extractBienBan(buffers)
    return ok(extraction)
  } catch {
    return badRequest(vi.imports.readFailed)
  }
}
