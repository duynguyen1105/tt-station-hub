import { NextResponse } from 'next/server'

// TEMPORARY diagnostic — surfaces which server module fails to load on Vercel.
// Remove once the deployment is healthy.
export const runtime = 'nodejs'

const checks: Array<[string, () => Promise<string>]> = [
  ['sharp', async () => (await import('sharp')).default.versions?.sharp ?? 'ok'],
  ['anthropic', async () => ((await import('@anthropic-ai/sdk')) ? 'ok' : 'ok')],
  ['image-prep', async () => ((await import('@/lib/ai/image-prep')) ? 'ok' : 'ok')],
  ['mock', async () => ((await import('@/lib/ai/mock')) ? 'ok' : 'ok')],
  ['extract-meter', async () => ((await import('@/lib/ai/extract-meter')) ? 'ok' : 'ok')],
]

export async function GET() {
  const out: Record<string, string> = {}
  for (const [name, fn] of checks) {
    try {
      out[name] = await fn()
    } catch (error) {
      out[name] = 'ERR: ' + ((error as Error)?.message ?? String(error))
    }
  }
  return NextResponse.json(out)
}
