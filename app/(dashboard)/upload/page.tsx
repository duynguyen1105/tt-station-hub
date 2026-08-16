import { PhotoUploadForm } from '@/components/photos/photo-upload-form'
import { requireUser } from '@/lib/auth/session'
import { canAccessStation } from '@/lib/auth/station-access'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

export default async function UploadPage() {
  const user = await requireUser()

  const [allStations, allDispensers] = await Promise.all([
    prisma.station.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, assignedAccountantId: true },
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
  // Phụ trách is what decides here, so it is dropped again before the rows cross
  // to the browser rather than riding along in the picker.
  const stations = allStations
    .filter((station) => canAccessStation(user, station))
    .map(({ id, code, name }) => ({ id, code, name }))
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
