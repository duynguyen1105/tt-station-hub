import { createServerClient } from '@supabase/ssr'

import { type NextRequest, NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'

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

  // A tài khoản can be ngưng hoạt động while its owner is still sitting at their
  // desk with a screen open, and the session cookie in their browser stays valid
  // until it expires on its own. So the flag is read here, on every page request,
  // rather than only when somebody signs in.
  //
  // It is not what refuses them — getCurrentUser() reads the same flag, so every
  // page and every route handler already turns a stopped tài khoản away on its next
  // request. But a page can only redirect, and the rule below would bounce them
  // straight back to it: a loop rather than a refusal. This is the layer that can
  // end the session instead, because it is the one holding the response the cookies
  // are written on.
  if (user?.sub && !isPublicPath(pathname)) {
    const profile = await prisma.profile.findUnique({
      where: { id: user.sub },
      select: { isActive: true },
    })
    if (!profile?.isActive) {
      // Local scope: no round-trip to the Auth server, so an unreachable one cannot
      // leave the cookies in place and the loop back. Signing in again is no way
      // around it — the next request lands here and reads the same flag.
      await supabase.auth.signOut({ scope: 'local' })
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      // Named, or they would sit there retyping a password that is not the problem
      // — but only when a tài khoản was really stopped. A session that resolves to
      // no profile at all is a different fault, and saying they were ngưng hoạt
      // động would be telling them something that did not happen.
      url.search = profile ? '?suspended=1' : ''
      const response = NextResponse.redirect(url)
      // The cleared cookies have to travel on the redirect too, or the session that
      // was just ended arrives back with the next request.
      for (const cookie of supabaseResponse.cookies.getAll()) response.cookies.set(cookie)
      return response
    }
  }

  if (user && isPublicPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
