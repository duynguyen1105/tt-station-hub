import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, unlinkSync } from 'node:fs'
import { extname, join } from 'node:path'

import { PrismaClient } from '../lib/generated/prisma/client'

// Simulates a real Zalo `user_send_image` webhook locally — WITHOUT needing the OA
// OAuth grant or real Zalo delivery. It serves a local image via the dev server's
// public/ folder, registers a test sender in the allowlist, signs the event the way
// Zalo does (SHA256(appId + rawBody + body.timestamp + OASecretKey)), and POSTs it
// to the local webhook, exercising the full handler:
//   signature verify -> parse -> allowlist -> download -> Claude reads -> match -> review.
//
// Requires `pnpm dev` running on :3001 and a real meter photo on disk.
// Usage: pnpm tsx scripts/simulate-zalo-photo.ts <imagePath> [stationCode] [caption]

const BASE = process.env.SIM_BASE_URL ?? 'http://localhost:3001'
const SENDER_ID = 'sim-local-tester'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' })
const prisma = new PrismaClient({ adapter })

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function waitForUrl(url: string, attempts = 20): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {
      // dev server not ready yet
    }
    await sleep(500)
  }
  return false
}

async function main() {
  const [, , imagePath, stationCode = 'DAKNONG_1', ...captionParts] = process.argv
  if (!imagePath || !existsSync(imagePath)) {
    console.error(
      'Usage: pnpm tsx scripts/simulate-zalo-photo.ts <imagePath> [stationCode] [caption]'
    )
    console.error(imagePath ? `Image not found: ${imagePath}` : 'Missing <imagePath>')
    process.exit(1)
  }
  const caption = captionParts.join(' ') || null

  const station = await prisma.station.findUnique({
    where: { code: stationCode },
    select: { id: true, name: true },
  })
  if (!station) {
    console.error(`Station "${stationCode}" not found.`)
    process.exit(1)
  }

  // 1) Register a simulated sender into the allowlist (proves allowlist routing).
  await prisma.zaloSender.upsert({
    where: { zaloUserId: SENDER_ID },
    create: {
      zaloUserId: SENDER_ID,
      stationId: station.id,
      displayName: 'Local Simulation',
      isActive: true,
    },
    update: { stationId: station.id, isActive: true },
  })

  // 2) Serve the image from public/ so the webhook can download it like a Zalo CDN URL.
  const fileName = `zalo-sim-${process.pid}${extname(imagePath) || '.jpg'}`
  const publicPath = join(process.cwd(), 'public', fileName)
  copyFileSync(imagePath, publicPath)
  const imageUrl = `${BASE}/${fileName}`

  if (!(await waitForUrl(imageUrl))) {
    console.error(
      `Could not serve the image at ${imageUrl} — is the dev server running on ${BASE}?`
    )
    if (existsSync(publicPath)) unlinkSync(publicPath)
    process.exit(1)
  }

  // 3) Build a real Zalo event + sign it exactly as Zalo does.
  const appId = process.env.ZALO_OA_APP_ID ?? ''
  const secret = process.env.ZALO_OA_WEBHOOK_SECRET ?? ''
  const timestamp = Date.now().toString()
  const event = {
    app_id: appId,
    event_name: 'user_send_image',
    timestamp,
    sender: { id: SENDER_ID },
    recipient: { id: 'sim-oa' },
    message: {
      msg_id: `sim-${timestamp}`,
      text: caption ?? '',
      attachments: [{ type: 'image', payload: { url: imageUrl } }],
    },
  }
  const rawBody = JSON.stringify(event)
  const mac = createHash('sha256')
    .update(appId + rawBody + timestamp + secret)
    .digest('hex')

  // 4) POST to the local webhook.
  console.log(
    `→ POST ${BASE}/api/zalo/webhook  (sender=${SENDER_ID}, station=${stationCode}, image=${imageUrl})`
  )
  const res = await fetch(`${BASE}/api/zalo/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-ZEvent-Signature': `mac=${mac}` },
    body: rawBody,
  })
  console.log(`← ${res.status} ${await res.text()}`)
  console.log(res.ok ? '✓ Webhook accepted (signature valid).' : '✗ Webhook rejected.')

  // 5) Let the server download + process before removing the temp image.
  console.log(
    'Processing (download → Claude → match)… waiting 8s, then cleaning up the temp image.'
  )
  await sleep(8000)
  if (existsSync(publicPath)) unlinkSync(publicPath)
  console.log(
    `Done. Open the app → station "${station.name}" → Chốt ca: the shift should be in "Chờ duyệt".`
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
