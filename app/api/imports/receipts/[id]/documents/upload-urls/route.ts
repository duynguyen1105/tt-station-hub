import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, ok, unauthorized } from '@/lib/api/response'
import { getCurrentUser } from '@/lib/auth/session'
import { RECEIPT_DOC_KINDS, receiptDocPrefix, receiptForUpload } from '@/lib/imports/receipt-docs'
import { createUploadUrl, fileExt } from '@/lib/storage/photo-storage'

const schema = z.object({
  files: z
    .array(z.object({ kind: z.enum(RECEIPT_DOC_KINDS), contentType: z.string() }))
    .min(1)
    .max(50),
})

/**
 * Signed upload URLs for a receipt's papers (biên bản, phiếu xuất kho, related
 * photos): the browser PUTs each file straight to storage — scanned PDFs pass
 * Vercel's 4.5 MB body cap — then registers the paths via POST ../documents.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const receipt = await receiptForUpload(user, (await ctx.params).id)
  if (!receipt) return forbidden()
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())

  const slots = await Promise.all(
    parsed.data.files.map(async ({ kind, contentType }) => {
      const path = `${receiptDocPrefix(receipt.code, receipt.id, kind)}${randomUUID()}.${fileExt(contentType)}`
      return { path, uploadUrl: await createUploadUrl(path) }
    })
  )
  return ok(slots)
}
