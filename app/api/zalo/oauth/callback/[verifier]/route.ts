import { type NextRequest, NextResponse } from 'next/server'

// Serves the Zalo domain-verification file under the OAuth callback path so the
// "Tiền tố URL" (URL prefix) https://<host>/api/zalo/oauth/callback/ can be verified
// — Zalo fetches <prefix>/zalo_verifier<token>.html. Public, no secrets.
export const runtime = 'nodejs'

const VERIFIER_TOKEN = 'MD-4De_R311spemK_BuV3tgJpIwMvHTmC3Or'
const VERIFIER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta property="zalo-platform-site-verification" content="${VERIFIER_TOKEN}" />
</head>
<body>
There Is No Limit To What You Can Accomplish Using Zalo!
</body>
</html>`

export async function GET(_req: NextRequest, { params }: { params: Promise<{ verifier: string }> }) {
  const { verifier } = await params
  if (verifier.startsWith('zalo_verifier') && verifier.endsWith('.html')) {
    return new NextResponse(VERIFIER_HTML, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }
  return new NextResponse('Not found', { status: 404 })
}
