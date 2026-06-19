import { PhotoUploadForm } from '@/components/photos/photo-upload-form'
import { requireUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

export default async function UploadPage() {
  await requireUser()

  const stations = await prisma.station.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true },
  })

  return (
    <div className="space-y-6">
      <div>
        <p className="label-micro">Công cụ vận hành</p>
        <h1 className="text-2xl font-bold tracking-tight">{vi.upload.title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{vi.upload.subtitle}</p>
      </div>

      <PhotoUploadForm stations={stations} />
    </div>
  )
}
