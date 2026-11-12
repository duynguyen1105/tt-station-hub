import { type NextRequest } from 'next/server'

import { badRequest, notFound, ok, unauthorized } from '@/lib/api/response'
import { getCurrentUser } from '@/lib/auth/session'
import { uploadPhoto } from '@/lib/storage/photo-storage'

/** STORAGE_MOCK only: stands in for Supabase's signed upload URL (see createUploadUrl). */
export async function PUT(req: NextRequest) {
  if (process.env.STORAGE_MOCK !== 'true') return notFound()
  if (!(await getCurrentUser())) return unauthorized()
  const path = req.nextUrl.searchParams.get('path')
  if (!path || path.startsWith('/') || path.includes('..')) return badRequest()
  await uploadPhoto(path, Buffer.from(await req.arrayBuffer()))
  return ok({ path })
}
