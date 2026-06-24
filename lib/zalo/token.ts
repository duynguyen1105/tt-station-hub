import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'

const TOKEN_ID = 'default'
// Refresh a little before the real expiry so an in-flight reply never uses a dead token.
const REFRESH_SKEW_MS = 5 * 60 * 1000

type ZaloTokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: string
  error?: number
  error_name?: string
}

/** Persists a token set obtained from an auth-code exchange or a refresh. */
export async function storeZaloToken(t: {
  accessToken: string
  refreshToken: string
  expiresIn: number
  oaId?: string | null
}): Promise<void> {
  const expiresAt = new Date(Date.now() + t.expiresIn * 1000)
  await prisma.zaloOaToken.upsert({
    where: { id: TOKEN_ID },
    create: {
      id: TOKEN_ID,
      accessToken: t.accessToken,
      refreshToken: t.refreshToken,
      expiresAt,
      oaId: t.oaId ?? null,
    },
    update: {
      accessToken: t.accessToken,
      refreshToken: t.refreshToken,
      expiresAt,
      oaId: t.oaId ?? null,
    },
  })
}

/** Exchanges the rotating refresh token for a fresh access (+ refresh) token. */
async function refreshZaloToken(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number } | null> {
  const appId = process.env.ZALO_OA_APP_ID ?? ''
  const appSecret = process.env.ZALO_OA_APP_SECRET ?? ''
  const res = await fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
    method: 'POST',
    headers: { secret_key: appSecret, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      app_id: appId,
      grant_type: 'refresh_token',
    }),
  })
  const data = (await res.json().catch(() => null)) as ZaloTokenResponse | null
  if (!res.ok || !data?.access_token || !data.refresh_token) {
    logger.error({ status: res.status, data }, 'Zalo OA token refresh failed')
    return null
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: Number(data.expires_in ?? 0),
  }
}

/**
 * Returns a valid OA access token, refreshing it when near expiry. Falls back to
 * the ZALO_OA_ACCESS_TOKEN env var when the DB has no token yet, and returns null
 * when there is no usable token at all (caller then skips sending).
 */
export async function getValidAccessToken(): Promise<string | null> {
  const row = await prisma.zaloOaToken.findUnique({ where: { id: TOKEN_ID } })
  if (!row) {
    const envToken = process.env.ZALO_OA_ACCESS_TOKEN
    return envToken ? envToken : null
  }
  if (row.expiresAt.getTime() - Date.now() > REFRESH_SKEW_MS) {
    return row.accessToken
  }
  const refreshed = await refreshZaloToken(row.refreshToken)
  if (!refreshed) {
    // Refresh failed — try the (possibly stale) token rather than dropping the reply.
    return row.accessToken
  }
  await storeZaloToken({ ...refreshed, oaId: row.oaId })
  return refreshed.accessToken
}
