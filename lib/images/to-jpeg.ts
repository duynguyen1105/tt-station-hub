import { vi } from '@/messages/vi'

// Every photo sent through an API route is re-encoded so each request stays well
// under Vercel's 4.5 MB body cap; the AI only ever sees ≤ 1568 px, so nothing it
// can read is lost.
const MAX_EDGE = 2048
const QUALITY = 0.85
const RETRY_QUALITY = 0.7
const SIZE_CAP = 2_000_000

/** Decodes a picked photo and re-encodes it as a JPEG no larger than the request can carry. */
export async function toJpeg(url: string): Promise<Blob> {
  // The <img> path applies EXIF orientation, and decodes HEIC on Safari.
  const img = new Image()
  img.src = url
  try {
    await img.decode()
  } catch {
    throw new Error(vi.upload.unreadable)
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
  const encode = (quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  let blob = await encode(QUALITY)
  if (blob && blob.size > SIZE_CAP) blob = await encode(RETRY_QUALITY)
  if (!blob) throw new Error(vi.upload.unreadable)
  // Two of these make a công nợ pair, so this cap is what keeps a request under 4.5 MB.
  if (blob.size > SIZE_CAP) throw new Error(vi.upload.tooLarge)
  return blob
}
