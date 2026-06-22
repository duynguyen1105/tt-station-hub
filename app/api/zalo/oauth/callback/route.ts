import { type NextRequest, NextResponse } from 'next/server'

import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

/**
 * Zalo OA OAuth callback. The OA admin authorizes the app at
 *   https://oauth.zaloapp.com/v4/oa/permission?app_id=<APP_ID>&redirect_uri=<this>
 * Zalo redirects back here with ?code=...&oa_id=..., and we exchange the code for
 * an access_token + refresh_token (header `secret_key` = the dev APP secret).
 * Approving the consent screen is what records the "cấp quyền" grant that lets the
 * app receive the OA's webhooks — the token exchange below is a bonus (for replies).
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const oaId = req.nextUrl.searchParams.get('oa_id')
  if (!code) {
    return NextResponse.json(
      { error: 'missing code', query: Object.fromEntries(req.nextUrl.searchParams) },
      { status: 400 }
    )
  }

  const appId = process.env.ZALO_OA_APP_ID ?? ''
  const appSecret = process.env.ZALO_OA_APP_SECRET ?? ''
  const res = await fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
    method: 'POST',
    headers: { secret_key: appSecret, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, app_id: appId, grant_type: 'authorization_code' }),
  })
  const data = (await res.json().catch(() => null)) as {
    access_token?: string
    refresh_token?: string
    expires_in?: string
  } | null

  if (!res.ok || !data?.access_token) {
    logger.error({ status: res.status, data }, 'Zalo OA token exchange failed')
    return NextResponse.json(
      { error: 'token exchange failed', status: res.status, data },
      { status: 500 }
    )
  }

  // Log the full tokens so the operator can copy them into .env (local log only).
  logger.info(
    {
      oaId,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    },
    'Zalo OA authorized — access/refresh token obtained'
  )

  return NextResponse.json({
    ok: true,
    message: 'OA authorized. The app can now receive webhooks. Tokens captured server-side.',
    oa_id: oaId,
    expires_in: data.expires_in,
  })
}
