import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, created, forbidden, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { getCurrentUser } from '@/lib/auth/session'
import { RECEIPT_DOC_KINDS, isReceiptDocPath, receiptForUpload } from '@/lib/imports/receipt-docs'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  files: z
    .array(
      z.object({
        kind: z.enum(RECEIPT_DOC_KINDS),
        path: z.string(),
        fileName: z.string().max(255).nullable(),
        contentType: z.string().max(100).nullable(),
      })
    )
    .min(1)
    .max(50),
})

/**
 * Records a receipt's papers once the browser has PUT them to storage through
 * ./upload-urls: the biên bản pages and phiếu xuất kho right after confirm, and
 * ALL photos related to the delivery session (seals, tanker gauges, dip sticks,
 * pumps...) in the wizard's last step or later from the receipt page.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const receipt = await receiptForUpload(user, (await ctx.params).id)
  if (!receipt) return forbidden()
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  const { files } = parsed.data
  if (!files.every((f) => isReceiptDocPath(f.path, receipt.code, receipt.id, f.kind)))
    return badRequest()

  // One by one, in picking order: the receipt page lists papers by createdAt.
  for (const file of files)
    await prisma.fuelImportDocument.create({
      data: {
        receiptId: receipt.id,
        kind: file.kind,
        storagePath: file.path,
        fileName: file.fileName,
        contentType: file.contentType,
      },
    })

  await writeAudit({
    userId: user.id,
    action: 'fuel_import_receipt.documents',
    entity: 'fuel_import_receipt',
    entityId: receipt.id,
    metadata: Object.fromEntries(
      RECEIPT_DOC_KINDS.map((kind) => [kind, files.filter((f) => f.kind === kind).length])
    ),
  })
  return created({ photos: files.length })
}
