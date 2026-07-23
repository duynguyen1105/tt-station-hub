import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

import { PrismaClient } from '../lib/generated/prisma/client'
import { createAdminClient } from '../lib/supabase/admin'

// Provisions Supabase Auth users for the seeded profiles so each role can log in
// at /login and be tested (DEMO_MODE=false / real mode). Self-contained
// (no `@/` alias), mirroring prisma/seed.ts.
//
// Login maps the Auth JWT `sub` to `profiles.id` by UUID (lib/auth/session.ts),
// so each Auth user is created with the *existing* profile's UUID (looked up by
// email — profiles may already carry real UUIDs). Idempotent: re-running resets
// the password. Password comes from SEED_AUTH_PASSWORD (default "truongthinh").
//
// Requires the profiles to exist first (`pnpm exec prisma db seed`).
//
// Usage:
//   pnpm tsx scripts/create-auth-users.ts
//   SEED_AUTH_PASSWORD=... pnpm tsx scripts/create-auth-users.ts

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' })
const prisma = new PrismaClient({ adapter })

const PASSWORD = process.env.SEED_AUTH_PASSWORD ?? 'truongthinh'

const EMAILS = ['admin@truongthinh.local', 'vi@truongthinh.local', 'viewer@truongthinh.local']

async function main() {
  const supabase = createAdminClient()

  for (const email of EMAILS) {
    const profile = await prisma.profile.findUnique({
      where: { email },
      select: { id: true, role: true },
    })
    if (!profile) {
      console.error(`✗ ${email}: no profile — run \`pnpm exec prisma db seed\` first.`)
      process.exitCode = 1
      continue
    }

    // Create the Auth user with the profile's UUID so the login lookup resolves;
    // email_confirm skips the confirmation email so it can log in immediately.
    const created = await supabase.auth.admin.createUser({
      id: profile.id,
      email,
      password: PASSWORD,
      email_confirm: true,
    })

    if (!created.error) {
      console.log(`✓ Created Auth user ${email} (${profile.role})`)
      continue
    }

    // Already exists → reset password / confirm instead of failing.
    const updated = await supabase.auth.admin.updateUserById(profile.id, {
      password: PASSWORD,
      email_confirm: true,
    })
    if (updated.error) {
      console.error(`✗ ${email}: ${created.error.message} / ${updated.error.message}`)
      process.exitCode = 1
      continue
    }
    console.log(`✓ Updated Auth user ${email} (${profile.role}) — password reset`)
  }

  console.log(
    `\nDone. Password for all accounts: "${PASSWORD}". Log in at http://localhost:3000/login`
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
