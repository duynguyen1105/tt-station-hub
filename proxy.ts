import type { NextRequest } from 'next/server'

import { updateSession } from '@/lib/supabase/update-session'

// Next 16 renamed the `middleware` convention to `proxy`. Runs on the Node.js
// runtime by default, so Supabase SSR works without edge constraints.
export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    // Run on all paths except API routes, Next internals, and static assets.
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
