import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { planStationAssignment } from '@/lib/auth/station-assignment'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

// Họ tên, số điện thoại, and which trạm this person is phụ trách of. The username
// is deliberately absent: it is the identity the person signs in with, held by Auth
// as well as here, so changing it would mean writing to both systems with no
// transaction between them — the same problem creation has, for what is only ever a
// typo. A mistyped one is fixed by khóa-ing that tài khoản and creating another.
//
// The trạm arrive as the whole set the person holds afterwards, not as a diff: it is
// what the checklist knows, and it settles the case of two quản trị viên saving at
// once — the later save wins outright, rather than two half-applied diffs leaving a
// trạm with nobody. Absent means the assignments are left alone; an id no checkbox
// could have produced is ignored rather than refused, so no message is needed here.
const updateAccountantSchema = z.object({
  fullName: z.string().trim().min(1, vi.accountants.fullNameRequired),
  phone: z.string().trim().optional(),
  stationIds: z.array(z.string()).optional(),
})

/**
 * Corrects a kế toán's họ tên or số điện thoại, and settles which trạm they are
 * phụ trách of. Quản trị viên only.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()
  const { id } = await params

  const parsed = updateAccountantSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const named = parsed.error.issues.find((issue) => issue.path.length > 0)?.message
    return badRequest(named, parsed.error.flatten())
  }
  const { fullName, phone, stationIds } = parsed.data

  // Only a kế toán is edited from this screen. Any other profile — a quản trị
  // viên, an id that matches nobody — is not this endpoint's to write.
  const accountant = await prisma.profile.findUnique({
    where: { id },
    select: { role: true, fullName: true, phone: true },
  })
  if (!accountant || accountant.role !== 'accountant') return notFound()

  // Active trạm only, the same list the checklist was drawn from: a closed trạm
  // needs no kế toán, and one held by this person stays held so that reopening it
  // is not the same as starting over.
  const plan = stationIds
    ? planStationAssignment(
        id,
        await prisma.station.findMany({
          where: { isActive: true },
          select: { id: true, assignedAccountantId: true },
        }),
        stationIds
      )
    : null

  // One transaction, because a handover is two writes: the trạm has exactly one
  // phụ trách, and a half-applied move would leave it held by both or by neither.
  const [updated] = await prisma.$transaction([
    prisma.profile.update({ where: { id }, data: { fullName, phone: phone || null } }),
    prisma.station.updateMany({
      where: { id: { in: plan?.released ?? [] } },
      data: { assignedAccountantId: null },
    }),
    prisma.station.updateMany({
      where: { id: { in: plan?.claimed ?? [] } },
      data: { assignedAccountantId: id },
    }),
  ])

  await writeAudit({
    userId: user.id,
    action: 'accountant.update',
    entity: 'profile',
    entityId: id,
    // Both sides, because the point of auditing a correction is what it corrected.
    metadata: {
      from: { fullName: accountant.fullName, phone: accountant.phone },
      to: { fullName, phone: phone || null },
    },
  })

  // Its own entry rather than a field on the correction above: a handover changes
  // what another kế toán may read, which is worth finding on its own.
  if (plan && (plan.released.length > 0 || plan.claimed.length > 0)) {
    await writeAudit({
      userId: user.id,
      action: 'accountant.assign_stations',
      entity: 'profile',
      entityId: id,
      metadata: plan,
    })
  }
  return ok(updated)
}
