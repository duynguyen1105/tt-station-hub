import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, created, forbidden, serverError, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { planStationAssignment } from '@/lib/auth/station-assignment'
import { activeStationAccess } from '@/lib/auth/station-guard'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { createAdminClient } from '@/lib/supabase/admin'
import { vi } from '@/messages/vi'

// Each field carries the sentence the quản trị viên should read when it is wrong,
// so the rules live here alone and the dialog does not restate them.
const createAccountantSchema = z.object({
  fullName: z.string().trim().min(1, vi.accountants.fullNameRequired),
  // A username looks like an address but no mailbox exists behind it. Supabase
  // Auth still keeps it in the email column, so it has to parse as one — and it
  // is lower-cased here because Auth normalises it that way, and the profile must
  // carry the same string it will be looked up by.
  username: z.string().trim().toLowerCase().email(vi.accountants.usernameInvalid),
  password: z.string().min(8, vi.accountants.passwordTooShort),
  // The trạm this person is phụ trách of from their first sign-in. This person
  // is on nothing yet, so every one of them is a claim — and one another kế toán
  // is already on simply gains a second name.
  stationIds: z.array(z.string()).optional(),
})

/**
 * Creates a kế toán: the Supabase Auth login, the profile row that the session
 * resolves it to, and the trạm they are phụ trách of from their first sign-in.
 * Quản trị viên only — everything created here is a kế toán, so no role is accepted
 * in the payload.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()

  const parsed = createAccountantSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    // The first complaint about a field, so the dialog can say which one to fix.
    // A payload that is not an object at all has no field to name and falls back
    // to the generic message.
    const named = parsed.error.issues.find((issue) => issue.path.length > 0)?.message
    return badRequest(named, parsed.error.flatten())
  }
  const { fullName, username, password, stationIds } = parsed.data

  // Named rather than generic, so the quản trị viên knows to pick another one.
  // Asked of the profiles first because a profile can outlive its login — the
  // seed writes profiles on their own — and Auth cannot see that.
  const existing = await prisma.profile.findUnique({
    where: { email: username },
    select: { id: true },
  })
  if (existing) return badRequest(vi.accountants.usernameTaken)

  // Read before the login is made, not after: a database that has gone away between
  // the two would otherwise leave an auth user behind with nothing to undo it.
  // Active trạm only, the same list the checklist was drawn from, so a ticked id
  // that is not one of them is dropped rather than written.
  const stations = await activeStationAccess()

  const supabase = createAdminClient()
  // Auth goes first: it mints the identifier the profile is then written under —
  // the session resolves a profile by the token's subject — and it enforces
  // username uniqueness cheaply. Confirmed on creation because nothing could ever
  // arrive at an address nobody has.
  const authUser = await supabase.auth.admin.createUser({
    email: username,
    password,
    email_confirm: true,
  })
  if (authUser.error || !authUser.data.user) {
    const code = authUser.error?.code
    if (code === 'email_exists' || code === 'user_already_exists') {
      return badRequest(vi.accountants.usernameTaken)
    }
    logger.error({ error: authUser.error, username }, 'Auth user creation failed for kế toán')
    return serverError()
  }

  const id = authUser.data.user.id
  // This id is on no trạm yet, so this can only ever claim.
  const plan = planStationAssignment(id, stations, stationIds ?? [])

  let profile
  try {
    // One transaction with the trạm, so a kế toán is never created holding half of
    // what was ticked — and so the compensation below has only the login to undo.
    const [row] = await prisma.$transaction([
      prisma.profile.create({
        data: { id, email: username, fullName, role: 'accountant' },
      }),
      prisma.stationAccountant.createMany({
        data: plan.claimed.map((stationId) => ({ stationId, accountantId: id })),
      }),
    ])
    profile = row
  } catch (error) {
    // The two systems share no transaction, so the login made a moment ago is
    // undone by hand. Left behind it would be a login that resolves to no person:
    // unable to sign in, invisible in the list, and holding the username for good.
    const undo = await supabase.auth.admin.deleteUser(id)
    logger.error(
      { error, id, username, undoError: undo.error },
      'Kế toán profile write failed — auth user deleted'
    )
    // The likeliest reason the profile write failed is that the database is
    // unreachable — which is also where the audit log lives. Let it fail quietly
    // rather than throw past the response: the compensation has already happened,
    // and the error above is the record that survives either way.
    await writeAudit({
      userId: user.id,
      action: 'accountant.create_failed',
      entity: 'profile',
      entityId: id,
      metadata: { username, authUserDeleted: !undo.error },
    }).catch((auditError) => logger.error({ auditError }, 'Kế toán failure audit write failed'))
    return serverError()
  }

  await writeAudit({
    userId: user.id,
    action: 'accountant.create',
    entity: 'profile',
    entityId: profile.id,
    metadata: { username, fullName },
  })
  // Its own entry, as on the update route: this decides what the new kế toán may
  // read, and that is worth finding without reading every creation.
  if (plan.claimed.length > 0) {
    await writeAudit({
      userId: user.id,
      action: 'accountant.assign_stations',
      entity: 'profile',
      entityId: profile.id,
      metadata: plan,
    })
  }
  return created(profile)
}
