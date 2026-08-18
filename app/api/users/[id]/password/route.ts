import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, serverError, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { createAdminClient } from '@/lib/supabase/admin'
import { vi } from '@/messages/vi'

// The password, and it again. Nobody here has a mailbox, so there is no link to
// send: the reset is typed on this screen and read down a telephone, and typing
// it twice is the only guard against a kế toán being read a password that was
// mistyped and that nobody can recover.
//
// As with creation, the password is not trimmed — two rules disagreeing about a
// leading space would make a password nobody can sign in with. Each field
// carries the sentence to read when it is wrong, so the dialog does not restate
// the rules.
const passwordResetSchema = z
  .object({
    password: z.string().min(8, vi.accountants.passwordTooShort),
    // Defaulted rather than required so that a confirmation left out entirely is
    // refused by the same sentence as one typed differently — it is the same
    // mistake to the person reading it.
    confirmPassword: z.string().default(''),
  })
  .refine((reset) => reset.password === reset.confirmPassword, {
    path: ['confirmPassword'],
    message: vi.accountants.passwordMismatch,
  })

/**
 * Gives a kế toán a new password, the only way one is ever recovered here: the
 * kế toán rings the quản trị viên, who types it on their page and reads it back.
 * Quản trị viên only.
 *
 * The password lives in Supabase Auth alone, so nothing on the profile is
 * touched — họ tên, trạm phụ trách and the khóa state all come through
 * unchanged.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()
  const { id } = await params

  const parsed = passwordResetSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const named = parsed.error.issues.find((issue) => issue.path.length > 0)?.message
    return badRequest(named, parsed.error.flatten())
  }
  const { password } = parsed.data

  // As with an edit: only a kế toán is reset from this screen. A quản trị viên's
  // own password is not this endpoint's to write, and neither is an id that
  // matches nobody. A khóa-ed kế toán is still reset — the password and the khóa
  // are separate states, and restoring the tài khoản should not also need a
  // second call here.
  const accountant = await prisma.profile.findUnique({
    where: { id },
    select: { email: true, role: true },
  })
  if (!accountant || accountant.role !== 'accountant') return notFound()

  const supabase = createAdminClient()
  const updated = await supabase.auth.admin.updateUserById(id, { password })
  if (updated.error) {
    logger.error({ error: updated.error, id }, 'Kế toán password reset failed')
    return serverError()
  }

  await writeAudit({
    userId: user.id,
    action: 'accountant.password_reset',
    entity: 'profile',
    entityId: id,
    // That it happened and to whom, and nothing more: the password itself is
    // what the audit log must never be able to give back.
    metadata: { username: accountant.email },
  })
  return ok({ id })
}
