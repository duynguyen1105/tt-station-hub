import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { planStationAssignment } from '@/lib/auth/station-assignment'
import { activeStationAccess } from '@/lib/auth/station-guard'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

// Họ tên and which trạm this person is phụ trách of. The username
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
//
// Every field is optional because two different controls on the kế toán's page
// send here: the form, which sends họ tên and the trạm together, and Ngưng hoạt
// động / Kích hoạt, which sends only the tài khoản's state. Absent means leave it
// alone; họ tên is still refused when it is sent empty.
const updateAccountantSchema = z.object({
  fullName: z.string().trim().min(1, vi.accountants.fullNameRequired).optional(),
  stationIds: z.array(z.string()).optional(),
  // Ngưng hoạt động, and its undo. It deliberately does not touch the trạm above:
  // the assignment is kept so that kích hoạt lại gives the person back the work
  // they had, and `isStationUncovered` counts those trạm as having no working kế
  // toán in the meantime rather than letting them look covered.
  isActive: z.boolean().optional(),
})

/**
 * Corrects a kế toán's họ tên, settles which trạm they are phụ trách of, and
 * ngưng hoạt động or kích hoạt their tài khoản. Quản trị viên only.
 *
 * There is no DELETE beside it, and there is not meant to be: a kế toán is stamped
 * on every ca they duyệt and every công nợ they settle, so the row has to stay for
 * that history to keep saying who did it.
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
  const { fullName, stationIds, isActive } = parsed.data

  // Only a kế toán is edited from this screen. Any other profile — a quản trị
  // viên, an id that matches nobody — is not this endpoint's to write. It is also
  // what keeps a quản trị viên from ngưng hoạt động their own tài khoản here.
  const accountant = await prisma.profile.findUnique({
    where: { id },
    select: { role: true, fullName: true, isActive: true },
  })
  if (!accountant || accountant.role !== 'accountant') return notFound()

  const plan = stationIds
    ? planStationAssignment(id, await activeStationAccess(), stationIds)
    : null

  // One transaction with the profile, so a save is never half-applied — and the
  // writes name this kế toán alone: nobody else's row is deleted or added, so a
  // colleague sharing one of these trạm is left exactly where they were.
  const [updated] = await prisma.$transaction([
    prisma.profile.update({
      where: { id },
      // Each field stands on its own: what was sent is written, what was not is
      // left alone. The form sends họ tên; Ngưng hoạt động never mentions it, so it
      // does not move.
      data: {
        ...(fullName !== undefined ? { fullName } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    }),
    prisma.stationAccountant.deleteMany({
      where: { accountantId: id, stationId: { in: plan?.released ?? [] } },
    }),
    prisma.stationAccountant.createMany({
      data: (plan?.claimed ?? []).map((stationId) => ({ stationId, accountantId: id })),
      skipDuplicates: true,
    }),
  ])

  // Only when a detail was actually sent — Ngưng hoạt động corrects nothing, and
  // an entry saying a họ tên went from itself to itself would be a false trail.
  if (fullName !== undefined) {
    await writeAudit({
      userId: user.id,
      action: 'accountant.update',
      entity: 'profile',
      entityId: id,
      // Both sides, because the point of auditing a correction is what it corrected.
      // The new side is read back off the row, so it is what was written rather than
      // what was asked for.
      metadata: {
        from: { fullName: accountant.fullName },
        to: { fullName: updated.fullName },
      },
    })
  }

  // Its own action rather than a field on the correction above, and named for what
  // happened rather than which flag moved: cutting someone off mid-shift and giving
  // them their work back are the two entries a quản trị viên would come looking for.
  // Only when it actually changed — saving the row twice is not a second suspension.
  if (isActive !== undefined && isActive !== accountant.isActive) {
    await writeAudit({
      userId: user.id,
      action: isActive ? 'accountant.restore' : 'accountant.suspend',
      entity: 'profile',
      entityId: id,
      metadata: { fullName: accountant.fullName },
    })
  }

  // Its own entry rather than a field on the correction above: this changes what
  // a kế toán may read, which is worth finding on its own.
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
