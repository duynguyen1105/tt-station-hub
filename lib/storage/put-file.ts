import { vi } from '@/messages/vi'

/**
 * Browser side of a signed upload URL (see createUploadUrl): the file goes straight
 * to storage, never through a Vercel function and its 4.5 MB request-body cap.
 */
export async function putFile(uploadUrl: string, file: Blob): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file,
  }).catch(() => null)
  if (!res?.ok) throw new Error(vi.errors.uploadFailed)
}
