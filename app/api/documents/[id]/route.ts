import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { documentStatus } from '@/lib/documents/expiry-checker'
import { prisma } from '@/lib/prisma'
import { deletePhoto, uploadPhoto } from '@/lib/storage/photo-storage'

const date = z.union([z.null(), z.coerce.date()]).optional()
const updateSchema = z
  .object({
    docType: z.string().min(1),
    docName: z.string().min(1),
    docNumber: z.string().nullable(),
    issuedDate: date,
    expiryDate: date,
    issuingAuthority: z.string().nullable(),
    notes: z.string().nullable(),
    fileUrl: z.string().nullable(),
  })
  .partial()

type Context = { params: Promise<{ id: string }> }

// Only files this row's scan-upload path created belong to this document. JSON callers
// can attach arbitrary URLs, which must never become arbitrary storage deletion targets.
function ownedScan(path: string | null, id: string): path is string {
  if (!path || path.startsWith('/') || path.includes('..') || path.includes('://')) return false
  const filename = path.split('/documents/')[1]
  return (
    !!filename &&
    (filename.startsWith(`${id}.`) || filename.startsWith(`${id}-`)) &&
    !filename.includes('/')
  )
}

export async function PATCH(req: NextRequest, { params }: Context) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()
  const { id } = await params
  const old = await prisma.stationDocument.findUnique({ where: { id } })
  if (!old) return notFound()
  if (!(await canReachStation(user, old.stationId))) return forbidden()

  let raw: unknown
  let scan: File | null = null
  if (req.headers.get('content-type')?.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null)
    if (!form) return badRequest()
    raw = {}
    for (const key of [
      'docType',
      'docName',
      'docNumber',
      'issuedDate',
      'expiryDate',
      'issuingAuthority',
      'notes',
    ]) {
      const value = form.get(key)
      if (typeof value === 'string') (raw as Record<string, unknown>)[key] = value.trim() || null
    }
    const file = form.get('scan')
    if (file instanceof File && file.size > 0) scan = file
  } else {
    raw = await req.json().catch(() => null)
  }
  const parsed = updateSchema.safeParse(raw)
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  if (!Object.keys(parsed.data).length && !scan) return badRequest()
  const fields = parsed.data
  const status = documentStatus(
    fields.expiryDate === undefined ? old.expiryDate : fields.expiryDate,
    new Date()
  )
  let path: string | null = null
  if (scan) {
    const station = await prisma.station.findUnique({
      where: { id: old.stationId },
      select: { code: true },
    })
    const ext =
      { 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[scan.type] ?? 'jpg'
    path = `${station?.code ?? 'UNKNOWN'}/documents/${id}-${randomUUID()}.${ext}`
    await uploadPhoto(path, Buffer.from(await scan.arrayBuffer()), scan.type || 'image/jpeg')
  }
  let updated
  try {
    updated = await prisma.stationDocument.update({
      where: { id },
      data: { ...fields, status, ...(path ? { fileUrl: path } : {}) },
    })
  } catch (error) {
    if (path) await deletePhoto(path)
    throw error
  }
  if (old.fileUrl && old.fileUrl !== updated.fileUrl && ownedScan(old.fileUrl, id))
    await deletePhoto(old.fileUrl)
  await writeAudit({
    userId: user.id,
    action: 'document.update',
    entity: 'station_document',
    entityId: id,
    metadata: { from: old, to: updated },
  })
  return ok(updated)
}

export async function DELETE(_req: NextRequest, { params }: Context) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()
  const { id } = await params
  const old = await prisma.stationDocument.findUnique({ where: { id } })
  if (!old) return notFound()
  if (!(await canReachStation(user, old.stationId))) return forbidden()
  await prisma.stationDocument.delete({ where: { id } })
  if (ownedScan(old.fileUrl, id)) await deletePhoto(old.fileUrl)
  await writeAudit({
    userId: user.id,
    action: 'document.delete',
    entity: 'station_document',
    entityId: id,
    metadata: { from: old, to: null },
  })
  return ok({ id })
}
