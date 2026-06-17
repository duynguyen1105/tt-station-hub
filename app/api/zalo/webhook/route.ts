import { type NextRequest, NextResponse } from 'next/server'

import { logger } from '@/lib/logger'
import { verifyZaloSignature } from '@/lib/zalo/signature'
import { handleZaloImageMessage, parseZaloEvent } from '@/lib/zalo/webhook-handler'

export const runtime = 'nodejs'

// Zalo may verify the webhook URL with a GET challenge.
export async function GET() {
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const isMock = process.env.ZALO_MOCK === 'true'

  if (isMock) {
    // Mock mode still requires a shared secret so the endpoint isn't open.
    if (req.headers.get('x-mock-secret') !== (process.env.ZALO_OA_WEBHOOK_SECRET ?? 'mock')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  } else {
    const ok = verifyZaloSignature({
      appId: process.env.ZALO_OA_APP_ID ?? '',
      rawData: rawBody,
      timestamp: req.headers.get('x-zevent-timestamp') ?? '',
      secret: process.env.ZALO_OA_WEBHOOK_SECRET ?? '',
      signatureHeader: req.headers.get('x-zevent-signature'),
    })
    if (!ok) {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
    }
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
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
