import type { ReceiptDocKind } from '@/lib/imports/receipt-docs'
import { putFile } from '@/lib/storage/put-file'
import { vi } from '@/messages/vi'

const apiError = async (res: Response) =>
  ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? vi.errors.generic

/**
 * Uploads a receipt's papers straight to storage (signed URLs), then records the
 * ones that landed. Throws a user-facing message when anything did not make it.
 */
export async function uploadReceiptDocs(
  receiptId: string,
  groups: { kind: ReceiptDocKind; files: File[] }[]
): Promise<void> {
  const files = groups.flatMap(({ kind, files }) => files.map((file) => ({ kind, file })))
  if (files.length === 0) return
  const base = `/api/imports/receipts/${receiptId}/documents`

  const slotsRes = await fetch(`${base}/upload-urls`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      files: files.map(({ kind, file }) => ({ kind, contentType: file.type })),
    }),
  })
  if (!slotsRes.ok) throw new Error(await apiError(slotsRes))
  const { data: slots } = (await slotsRes.json()) as {
    data: { path: string; uploadUrl: string }[]
  }

  const results = await Promise.allSettled(
    files.map(({ file }, i) => putFile(slots[i]!.uploadUrl, file))
  )
  const landed = files.flatMap(({ kind, file }, i) =>
    results[i]!.status === 'fulfilled'
      ? [
          {
            kind,
            path: slots[i]!.path,
            fileName: file.name || null,
            contentType: file.type || null,
          },
        ]
      : []
  )
  if (landed.length > 0) {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files: landed }),
    })
    if (!res.ok) throw new Error(await apiError(res))
  }
  if (landed.length < files.length)
    throw new Error(vi.imports.docsFailed(files.length - landed.length))
}
