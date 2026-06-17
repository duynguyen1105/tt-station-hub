import { redirect } from 'next/navigation'

import { type AppRole, isAppRole } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'

export type CurrentUser = {
  id: string
  email: string
  fullName: string
  role: AppRole
}

/**
 * Returns the signed-in user joined with their profile, or null if there is no
 * valid session. Never throws — callers decide how to handle an absent user.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null
  }

  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) return null

  const profile = await prisma.profile.findUnique({ where: { id: user.id } })
  if (!profile || !profile.isActive || !isAppRole(profile.role)) return null

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.fullName,
    role: profile.role,
  }
}

/**
 * Requires an authenticated user; redirects to /login otherwise.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

/**
 * Requires the user to hold one of the allowed roles; redirects otherwise.
 */
export async function requireRole(allowed: AppRole | AppRole[]): Promise<CurrentUser> {
  const user = await requireUser()
  const list = Array.isArray(allowed) ? allowed : [allowed]
  if (!list.includes(user.role)) redirect('/')
  return user
}
