import { type NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * Placeholder for periodic maintenance tasks (e.g. closing stale shifts,
 * low-stock alerts). Protect with `x-cron-secret: $CRON_SECRET`.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== (process.env.CRON_SECRET ?? '')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ ok: true })
}
