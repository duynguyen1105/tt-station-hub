import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = process.env.STORAGE_BUCKET ?? 'station-photos'

/** Uploads a photo to the private bucket and returns its storage path. */
export async function uploadPhoto(
  path: string,
  data: Buffer | Uint8Array,
  contentType = 'image/jpeg'
): Promise<{ path: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase.storage.from(BUCKET).upload(path, data, {
    contentType,
    upsert: true,
  })
  if (error) throw error
  return { path }
}

/** Creates a short-lived signed URL to view a stored photo. */
export async function getSignedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds)
  if (error) throw error
  return data.signedUrl
}

// Review sessions stay open for hours; a link that expires mid-review breaks the
// enlarge dialog, so review screens sign for a full working day.
export const REVIEW_URL_TTL_SECONDS = 60 * 60 * 8

/**
 * Signs view URLs for a set of shift-photo ids (review screens attach them next to
 * the AI-read numbers). Returns a photoId -> signedUrl map; unknown ids and photos
 * without a storage path are simply absent.
 */
export async function signedUrlsForPhotoIds(
  prisma: {
    shiftPhoto: {
      findMany: (args: {
        where: { id: { in: string[] } }
        select: { id: true; storagePath: true }
      }) => Promise<{ id: string; storagePath: string | null }[]>
    }
  },
  ids: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))]
  const urlById = new Map<string, string>()
  if (!unique.length) return urlById
  const photos = await prisma.shiftPhoto.findMany({
    where: { id: { in: unique } },
    select: { id: true, storagePath: true },
  })
  await Promise.all(
    photos.map(async (p) => {
      if (!p.storagePath) return
      const url = await getSignedUrl(p.storagePath, REVIEW_URL_TTL_SECONDS).catch(() => null)
      if (url) urlById.set(p.id, url)
    })
  )
  return urlById
}
