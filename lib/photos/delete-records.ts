import { type Prisma } from '@/lib/generated/prisma/client'

/** Remove scalar references before deleting photos; these columns have no foreign keys. */
export async function deletePhotoRecords(
  db: Prisma.TransactionClient,
  ids: string[]
): Promise<string[]> {
  if (ids.length === 0) return []
  const photos = await db.shiftPhoto.findMany({
    where: { id: { in: ids } },
    select: { storagePath: true },
  })
  await db.shiftReading.updateMany({
    where: { electronicPhotoId: { in: ids } },
    data: { electronicPhotoId: null },
  })
  await db.shiftReading.updateMany({
    where: { mechanicalPhotoId: { in: ids } },
    data: { mechanicalPhotoId: null },
  })
  await db.debtVehicleVisit.updateMany({
    where: { vehiclePhotoId: { in: ids } },
    data: { vehiclePhotoId: null },
  })
  await db.debtVehicleVisit.updateMany({
    where: { meterPhotoId: { in: ids } },
    data: { meterPhotoId: null },
  })
  await db.tankDipRecord.updateMany({
    where: { photoId: { in: ids } },
    data: { photoId: null },
  })
  await db.shiftPhoto.deleteMany({ where: { id: { in: ids } } })
  return photos.flatMap(({ storagePath }) => (storagePath ? [storagePath] : []))
}
