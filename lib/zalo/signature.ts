import { createHash, timingSafeEqual } from 'node:crypto'

// Zalo OA webhook signature (header `X-ZEvent-Signature: mac=<hex>`):
//   mac = SHA256(appId + rawData + timestamp + OASecretKey)
// NOTE: confirm the exact concatenation against current Zalo OA docs during
// integration — kept as a pure, testable function so it's easy to adjust.

export function computeZaloSignature(
  appId: string,
  rawData: string,
  timestamp: string,
  secret: string
): string {
  return createHash('sha256')
    .update(appId + rawData + timestamp + secret)
    .digest('hex')
}

export function verifyZaloSignature(params: {
  appId: string
  rawData: string
  timestamp: string
  secret: string
  signatureHeader: string | null
}): boolean {
  const { appId, rawData, timestamp, secret, signatureHeader } = params
  if (!signatureHeader) return false
  const provided = signatureHeader.replace(/^mac=/, '')
  const expected = computeZaloSignature(appId, rawData, timestamp, secret)
  if (provided.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}
