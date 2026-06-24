import { logger } from '@/lib/logger'
import { getValidAccessToken } from '@/lib/zalo/token'

function isZaloMock(): boolean {
  return process.env.ZALO_MOCK === 'true'
}

/** Downloads an image attachment from Zalo. Returns a placeholder in mock mode. */
export async function downloadZaloAttachment(url: string): Promise<Buffer> {
  if (isZaloMock()) {
    return Buffer.from('zalo-mock-image')
  }
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download Zalo attachment (${response.status})`)
  }
  return Buffer.from(await response.arrayBuffer())
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
