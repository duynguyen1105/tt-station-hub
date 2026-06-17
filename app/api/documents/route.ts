import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, created, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { documentStatus } from '@/lib/documents/expiry-checker'
import { prisma } from '@/lib/prisma'

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

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const parsed = createDocumentSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())

  const status = documentStatus(parsed.data.expiryDate ?? null, new Date())
  const document = await prisma.stationDocument.create({ data: { ...parsed.data, status } })
  await writeAudit({
    userId: user.id,
    action: 'document.create',
    entity: 'station_document',
    entityId: document.id,
  })
  return created(document)
}
