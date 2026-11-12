import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { documentStatus } from '@/lib/documents/expiry-checker'
import { ownedScan, stationScan } from '@/lib/documents/scan'
import { prisma } from '@/lib/prisma'
import { deletePhoto } from '@/lib/storage/photo-storage'

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

export async function PATCH(req: NextRequest, { params }: Context) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()
  const { id } = await params
  const old = await prisma.stationDocument.findUnique({ where: { id } })
  if (!old) return notFound()
  if (!(await canReachStation(user, old.stationId))) return forbidden()

  let raw: unknown
  let scanPath: string | null = null
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
    const path = form.get('scanPath')
    if (typeof path === 'string' && path) scanPath = path
  } else {
    raw = await req.json().catch(() => null)
  }
  const parsed = updateSchema.safeParse(raw)
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  if (!Object.keys(parsed.data).length && !scanPath) return badRequest()
  const fields = parsed.data
  const status = documentStatus(
    fields.expiryDate === undefined ? old.expiryDate : fields.expiryDate,
    new Date()
  )
  if (scanPath) {
    // The scan was PUT straight to storage via /api/documents/scan-upload.
    const station = await prisma.station.findUnique({
      where: { id: old.stationId },
      select: { code: true },
    })
    if (!station || !stationScan(scanPath, station.code, id)) return badRequest()
  }
  let updated
  try {
    updated = await prisma.stationDocument.update({
      where: { id },
      data: { ...fields, status, ...(scanPath ? { fileUrl: scanPath } : {}) },
    })
  } catch (error) {
    if (scanPath) await deletePhoto(scanPath)
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
  // Accountants clean up their own stations' papers too; viewers only read.
  if (user.role === 'viewer') return forbidden()
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
