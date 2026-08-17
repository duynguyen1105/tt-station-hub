import { PhotoUploadForm } from '@/components/photos/photo-upload-form'
import { requireUser } from '@/lib/auth/session'
import { reachableStationIds } from '@/lib/auth/station-guard'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

export default async function UploadPage() {
  const user = await requireUser()

  const [reachable, allStations, allDispensers] = await Promise.all([
    reachableStationIds(user).then((ids) => new Set(ids)),
    prisma.station.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true },
    }),
    prisma.dispenser.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
      select: { id: true, stationId: true, displayName: true, fuelType: true },
    }),
  ])

  // A kế toán is offered the trạm they are phụ trách of and no other, so a photo
  // cannot be filed against someone else's trạm by a slip of the finger — and the
  // trụ follow the trạm, since a pump is only ever picked for the trạm it is on.
  const stations = allStations.filter((station) => reachable.has(station.id))
  const offeredStationIds = new Set(stations.map((station) => station.id))
  const dispensers = allDispensers.filter((dispenser) => offeredStationIds.has(dispenser.stationId))

  return (
    <div className="space-y-6">
      <div>
        <p className="label-micro">Công cụ vận hành</p>
        <h1 className="text-2xl font-bold tracking-tight">{vi.upload.title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{vi.upload.subtitle}</p>
      </div>

      <PhotoUploadForm stations={stations} dispensers={dispensers} />
    </div>
  )
}
