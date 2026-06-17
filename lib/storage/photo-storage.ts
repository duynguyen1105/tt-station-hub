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
