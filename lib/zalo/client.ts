import { logger } from '@/lib/logger'
import { getValidAccessToken } from '@/lib/zalo/token'

function isZaloMock(): boolean {
  return process.env.ZALO_MOCK === 'true'
}

/**
 * Downloads an image attachment from Zalo. Returns a placeholder in mock mode.
 *
 * Under a burst (many photos sent at once) Zalo's CDN sometimes answers HTTP 200
 * with an EMPTY body, which would otherwise be stored as a 0-byte image the AI
 * can't read. So we retry with jittered backoff and reject empty responses,
 * throwing only if every attempt fails (the caller then skips that photo instead
 * of persisting a broken one).
 */
export async function downloadZaloAttachment(url: string): Promise<Buffer> {
  if (isZaloMock()) {
    return Buffer.from('zalo-mock-image')
  }
  const MAX_ATTEMPTS = 4
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`status ${response.status}`)
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.byteLength === 0) throw new Error('empty body')
      return buffer
    } catch (error) {
      lastError = error
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) =>
          setTimeout(r, 400 * 2 ** (attempt - 1) + Math.floor(Math.random() * 300))
        )
      }
    }
  }
  throw new Error(
    `Failed to download Zalo attachment: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  )
}

/** Sends a text reply to a Zalo user. Logs only in mock mode. */
export async function sendZaloMessage(userId: string, text: string): Promise<void> {
  if (isZaloMock()) {
    logger.info({ userId, text }, '[ZALO_MOCK] reply')
    return
  }
  const accessToken = await getValidAccessToken()
  if (!accessToken) {
    logger.error({ userId }, 'No Zalo OA access token — reply skipped (authorize the OA first)')
    return
  }
  const response = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
    method: 'POST',
    headers: { access_token: accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { user_id: userId }, message: { text } }),
  })
  // Zalo returns HTTP 200 even on logical failures; the real status is in body.error.
  const body = (await response.json().catch(() => null)) as {
    error?: number
    message?: string
  } | null
  if (!response.ok || (body?.error != null && body.error !== 0)) {
    logger.error(
      { userId, status: response.status, error: body?.error, message: body?.message },
      'Failed to send Zalo message'
    )
  }
}
