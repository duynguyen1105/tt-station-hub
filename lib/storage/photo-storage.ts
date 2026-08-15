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
 * Signs many storage paths in ONE storage API call (createSignedUrls) instead
 * of one round-trip per photo — page loads sign whole tables at once. Returns
 * a path -> signedUrl map; paths that fail to sign are simply absent.
 */
export async function signedUrlsForPaths(
  paths: (string | null | undefined)[],
  expiresInSeconds = 3600
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))]
  if (!unique.length) return new Map()
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(unique, expiresInSeconds)
  if (error || !data) return new Map()
  const byPath = new Map<string, string>()
  for (const row of data) {
    if (row.path && row.signedUrl && !row.error) byPath.set(row.path, row.signedUrl)
  }
  return byPath
}

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
  const byPath = await signedUrlsForPaths(
    photos.map((p) => p.storagePath),
    REVIEW_URL_TTL_SECONDS
  )
  for (const p of photos) {
    const url = p.storagePath ? byPath.get(p.storagePath) : undefined
    if (url) urlById.set(p.id, url)
  }
  return urlById
}
