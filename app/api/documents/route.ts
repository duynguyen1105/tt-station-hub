import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, created, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { documentStatus } from '@/lib/documents/expiry-checker'
import { prisma } from '@/lib/prisma'
import { uploadPhoto } from '@/lib/storage/photo-storage'

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const stationId = req.nextUrl.searchParams.get('stationId')

  const documents = await prisma.stationDocument.findMany({
    where: stationId ? { stationId } : undefined,
    orderBy: { expiryDate: 'asc' },
  })
  return ok(documents)
}

const createDocumentSchema = z.object({
  stationId: z.string().uuid(),
  docType: z.string().min(1),
  docName: z.string().min(1),
  docNumber: z.string().optional(),
  issuedDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().optional(),
  issuingAuthority: z.string().optional(),
  fileUrl: z.string().optional(),
  notes: z.string().optional(),
})

/**
 * Creates a legal document. Accepts multipart (fields + optional `scan` file —
 * the signed paper, stored under <STATION>/documents/) or the original JSON
 * body for API callers without a file.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  let raw: Record<string, unknown>
  let scan: File | null = null
  if (req.headers.get('content-type')?.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null)
    if (!form) return badRequest()
    raw = {}
    for (const key of [
      'stationId',
      'docType',
      'docName',
      'docNumber',
      'issuedDate',
      'expiryDate',
      'issuingAuthority',
      'notes',
    ]) {
      const value = form.get(key)
      if (typeof value === 'string' && value.trim() !== '') raw[key] = value
    }
    const file = form.get('scan')
    if (file instanceof File && file.size > 0) scan = file
  } else {
    raw = (await req.json().catch(() => null)) as Record<string, unknown>
  }

  const parsed = createDocumentSchema.safeParse(raw)
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())

  const status = documentStatus(parsed.data.expiryDate ?? null, new Date())
  const document = await prisma.stationDocument.create({ data: { ...parsed.data, status } })

  // The scan uploads AFTER the row exists (path carries the document id); a
  // failed upload never loses the document itself.
  if (scan) {
    try {
      const station = await prisma.station.findUnique({
        where: { id: parsed.data.stationId },
        select: { code: true },
      })
      const ext = EXT_BY_TYPE[scan.type] ?? 'jpg'
      const path = `${station?.code ?? 'UNKNOWN'}/documents/${document.id}.${ext}`
      await uploadPhoto(path, Buffer.from(await scan.arrayBuffer()), scan.type || 'image/jpeg')
      await prisma.stationDocument.update({ where: { id: document.id }, data: { fileUrl: path } })
    } catch {
      // Document stays valid without its scan.
    }
  }

  await writeAudit({
    userId: user.id,
    action: 'document.create',
    entity: 'station_document',
    entityId: document.id,
    metadata: { scan: scan !== null },
  })
  return created(document)
}
