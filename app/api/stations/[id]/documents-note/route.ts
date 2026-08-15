import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'

const bodySchema = z.object({
  note: z
    .string()
    .trim()
    .max(2000)
    .transform((value) => (value === '' ? null : value)),
})

/**
 * Sets the station's document requirement ("giấy tờ từ 1-10 ...") shown at the
 * top of the legal-documents tab. ADMIN ONLY — this is the compliance bar the
 * rest of the team reads, so only the admin writes it. Audited with the
 * previous text.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()

  const { id } = await ctx.params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())

  const station = await prisma.station.findUnique({
    where: { id },
    select: { id: true, documentsNote: true },
  })
  if (!station) return notFound()

  await prisma.station.update({ where: { id }, data: { documentsNote: parsed.data.note } })
  await writeAudit({
    userId: user.id,
    action: 'station.documents_note',
    entity: 'station',
    entityId: id,
    metadata: { note: parsed.data.note, previous: station.documentsNote },
  })
  return ok({ ok: true })
}
