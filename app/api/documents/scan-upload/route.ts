import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { prisma } from '@/lib/prisma'
import { createUploadUrl, fileExt } from '@/lib/storage/photo-storage'

const schema = z.object({
  stationId: z.string().uuid(),
  // Set when replacing the scan of an existing document; omitted for a new one.
  documentId: z.string().uuid().optional(),
  contentType: z.string(),
})

/**
 * Hands the browser a signed upload URL so the scan goes straight to storage —
 * a scanned PDF easily passes Vercel's 4.5 MB body cap. The returned `path` is
 * then sent to POST /api/documents (with `id`) or PATCH /api/documents/[id].
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role === 'viewer') return forbidden()
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  const { stationId, documentId, contentType } = parsed.data
  if (!(await canReachStation(user, stationId))) return forbidden()

  if (documentId) {
    // Same rule as PATCH: only an admin edits an existing document.
    if (user.role !== 'admin') return forbidden()
    const doc = await prisma.stationDocument.findUnique({
      where: { id: documentId },
      select: { stationId: true },
    })
    if (!doc) return notFound()
    if (doc.stationId !== stationId) return forbidden()
  }

  const station = await prisma.station.findUnique({
    where: { id: stationId },
    select: { code: true },
  })
  if (!station) return notFound()
  const id = documentId ?? randomUUID()
  const ext = fileExt(contentType)
  const path = documentId
    ? `${station.code}/documents/${id}-${randomUUID()}.${ext}`
    : `${station.code}/documents/${id}.${ext}`
  return ok({ id, path, uploadUrl: await createUploadUrl(path) })
}
