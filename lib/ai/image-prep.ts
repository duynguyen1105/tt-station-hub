import sharp from 'sharp'

export type PreparedImage = {
  base64: string
  mediaType: 'image/jpeg'
}

// Claude Vision works best with images no larger than ~1568px on the long edge.
const MAX_DIMENSION = 1568

/**
 * Resizes + compresses an image before sending it to the AI: auto-orients via
 * EXIF, caps the long edge at 1568px, and re-encodes as JPEG quality 85.
 * Note: we only use EXIF for orientation — GPS/timestamp watermarks are never
 * trusted for business logic.
 */
export async function prepareImageForAI(input: Buffer | Uint8Array): Promise<PreparedImage> {
  const output = await sharp(input)
    .rotate()
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer()

  return { base64: output.toString('base64'), mediaType: 'image/jpeg' }
}
