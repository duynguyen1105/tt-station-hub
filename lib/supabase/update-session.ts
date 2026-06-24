import { createServerClient } from '@supabase/ssr'

import { type NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/login']

function isPublicPath(pathname: string): boolean {
  // Zalo domain-verification file (zalo_verifierXXXX.html) must be reachable
  // without auth so Zalo can fetch it to verify domain ownership.
  if (pathname.startsWith('/zalo_verifier')) return true
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Refreshes the Supabase auth session cookie and gates pages: unauthenticated
 * users are redirected to /login, signed-in users are kept off /login.
 * Called from the root `proxy.ts` (Next 16's renamed middleware).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  // Skip gating when Supabase is not configured yet (local preview before
  // provisioning) so the app still renders.
  if (!supabaseUrl || !supabaseKey) {
    return supabaseResponse
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options)
        })
      },
    },
  })

  // getClaims() refreshes the session cookie (via the cookie handlers above) and
  // verifies the JWT locally when asymmetric signing keys are enabled, avoiding an
  // Auth-server round-trip on every navigation. Falls back to a network check
  // otherwise, so it is never slower than getUser().
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims ?? null

  const { pathname } = request.nextUrl

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isPublicPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
