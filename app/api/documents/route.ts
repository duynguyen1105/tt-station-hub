import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, created, forbidden, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation, reachableStationIds } from '@/lib/auth/station-guard'
import { documentStatus } from '@/lib/documents/expiry-checker'
import { stationScan } from '@/lib/documents/scan'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const stationId = req.nextUrl.searchParams.get('stationId')
  if (stationId && !(await canReachStation(user, stationId))) return forbidden()

  const documents = await prisma.stationDocument.findMany({
    where: { stationId: stationId ?? { in: await reachableStationIds(user) } },
    orderBy: { expiryDate: 'asc' },
  })
  return ok(documents)
}

const createDocumentSchema = z.object({
  id: z.string().uuid().optional(),
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
 * Creates a legal document. Accepts multipart (fields + optional `scanPath` — the
 * signed paper, already uploaded via /api/documents/scan-upload together with the
 * `id` it was issued for) or the original JSON body for API callers without a file.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  // Người xem only reads.
  if (user.role === 'viewer') return forbidden()

  let raw: Record<string, unknown>
  let scanPath: string | null = null
  if (req.headers.get('content-type')?.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null)
    if (!form) return badRequest()
    raw = {}
    for (const key of [
      'id',
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
    const path = form.get('scanPath')
    if (typeof path === 'string' && path) scanPath = path
  } else {
    raw = (await req.json().catch(() => null)) as Record<string, unknown>
  }

  const parsed = createDocumentSchema.safeParse(raw)
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  if (!(await canReachStation(user, parsed.data.stationId))) return forbidden()

  if (scanPath) {
    const station = await prisma.station.findUnique({
      where: { id: parsed.data.stationId },
      select: { code: true },
    })
    if (!station || !parsed.data.id || !stationScan(scanPath, station.code, parsed.data.id))
      return badRequest()
  }

  const status = documentStatus(parsed.data.expiryDate ?? null, new Date())
  const document = await prisma.stationDocument.create({
    data: { ...parsed.data, status, ...(scanPath ? { fileUrl: scanPath } : {}) },
  })

  await writeAudit({
    userId: user.id,
    action: 'document.create',
    entity: 'station_document',
    entityId: document.id,
    metadata: { scan: scanPath !== null },
  })
  return created(document)
}
