export type PreparedImage = {
  base64: string
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
}

// Claude Vision works best with images no larger than ~1568px on the long edge.
const MAX_DIMENSION = 1568

/** Detects the image media type from the file's magic bytes (defaults to JPEG). */
function detectMediaType(bytes: Buffer): PreparedImage['mediaType'] {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png'
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45
  ) {
    return 'image/webp'
  }
  return 'image/jpeg'
}

/**
 * Resizes + compresses an image before sending it to the AI: auto-orients via
 * EXIF, caps the long edge at 1568px, and re-encodes as JPEG quality 85.
 *
 * sharp is a native module that can fail to load in some serverless runtimes,
 * so it is imported lazily and, if unavailable, we fall back to sending the
 * original image (Claude accepts JPEG/PNG/WebP up to 5MB and resizes internally).
 * We only use EXIF for orientation — GPS/timestamp watermarks are never trusted.
 */
export async function prepareImageForAI(input: Buffer | Uint8Array): Promise<PreparedImage> {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input)
  try {
    const sharp = (await import('sharp')).default
    const output = await sharp(bytes)
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
  } catch {
    // sharp unavailable (e.g. native-module load failure on serverless) — send as-is.
    return { base64: bytes.toString('base64'), mediaType: detectMediaType(bytes) }
  }
}
