import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

// Họ tên and số điện thoại, and nothing else. The username is deliberately absent:
// it is the identity the person signs in with, held by Auth as well as here, so
// changing it would mean writing to both systems with no transaction between them —
// the same problem creation has, for what is only ever a typo. A mistyped one is
// fixed by khóa-ing that tài khoản and creating another.
const updateAccountantSchema = z.object({
  fullName: z.string().trim().min(1, vi.accountants.fullNameRequired),
  phone: z.string().trim().optional(),
})

/** Corrects a kế toán's họ tên or số điện thoại. Quản trị viên only. */
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
  const { fullName, phone } = parsed.data

  // Only a kế toán is edited from this screen. Any other profile — a quản trị
  // viên, an id that matches nobody — is not this endpoint's to write.
  const accountant = await prisma.profile.findUnique({
    where: { id },
    select: { role: true, fullName: true, phone: true },
  })
  if (!accountant || accountant.role !== 'accountant') return notFound()

  const updated = await prisma.profile.update({
    where: { id },
    data: { fullName, phone: phone || null },
  })

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
  return ok(updated)
}
