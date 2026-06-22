import { type NextRequest, NextResponse } from 'next/server'

import { logger } from '@/lib/logger'
import { computeZaloSignature, verifyZaloSignature } from '@/lib/zalo/signature'
import { handleZaloImageMessage, parseZaloEvent } from '@/lib/zalo/webhook-handler'

export const runtime = 'nodejs'

// Zalo may verify the webhook URL with a GET challenge.
export async function GET() {
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const isMock = process.env.ZALO_MOCK === 'true'

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  if (isMock) {
    // Mock mode still requires a shared secret so the endpoint isn't open.
    if (req.headers.get('x-mock-secret') !== (process.env.ZALO_OA_WEBHOOK_SECRET ?? 'mock')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  } else {
    // Zalo OA signs: mac = SHA256(appId + rawBody + body.timestamp + OASecretKey),
    // header `X-ZEvent-Signature: mac=<hex>`. The timestamp comes from the BODY, not a header.
    const appId = process.env.ZALO_OA_APP_ID ?? ''
    const secret = process.env.ZALO_OA_WEBHOOK_SECRET ?? ''
    const bodyTimestamp =
      payload && typeof payload === 'object' && 'timestamp' in payload
        ? String((payload as { timestamp?: unknown }).timestamp ?? '')
        : ''
    const provided = req.headers.get('x-zevent-signature')
    const ok = verifyZaloSignature({
      appId,
      rawData: rawBody,
      timestamp: bodyTimestamp,
      secret,
      signatureHeader: provided,
    })
    if (!ok) {
      // Log provided vs expected so the exact formula can be confirmed from real traffic.
      logger.warn(
        {
          provided,
          expected: `mac=${computeZaloSignature(appId, rawBody, bodyTimestamp, secret)}`,
          bodyTimestamp,
          rawBody: rawBody.slice(0, 800),
        },
        'Zalo webhook signature mismatch'
      )
      // ZALO_SKIP_SIGNATURE=true (test only) lets us prove the pipeline end-to-end
      // while the exact signature formula is being confirmed. Off by default.
      if (process.env.ZALO_SKIP_SIGNATURE !== 'true') {
        return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
      }
      logger.warn('ZALO_SKIP_SIGNATURE=true — processing despite signature mismatch (TEST ONLY)')
    }
  }

  const message = parseZaloEvent(payload)
  if (message) {
    // Fire-and-forget: reply fast (<5s), process in the background.
    void handleZaloImageMessage(message).catch((error) =>
      logger.error({ error }, 'Zalo webhook handler failed')
    )
  }

  return NextResponse.json({ ok: true })
}
