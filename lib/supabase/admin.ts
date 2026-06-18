import { createClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client for server-side work without a user session
 * (Zalo webhook, storage uploads, cron). Bypasses RLS — never expose to the
 * browser.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SECRET_KEY ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
