import { Prisma } from '@/lib/generated/prisma/client'
import { logger } from '@/lib/logger'
import { findOrCreateShift, runShiftExtraction } from '@/lib/photos/ingest'
import { prisma } from '@/lib/prisma'
import { getSignedUrl } from '@/lib/storage/photo-storage'

// A real debt fill is always sent as a photo PAIR (vehicle/can + pump display),
// so a meter-only visit still unpaired after this window was a shift totalizer
// the router misread as a debt screen.
const STRAY_DEBT_METER_MAX_AGE_MS = 60 * 1000

/**
 * Reroutes stale meter-only debt visits into the shift-closing pipeline.
 * Called opportunistically (end of each webhook, review page loads) — there is
 * no cron on this deployment. UNKNOWN-station visits are left alone: the debt
 * review card is where their manual station dropdown lives.
 */
export async function sweepStrayDebtMeters(): Promise<number> {
  const cutoff = new Date(Date.now() - STRAY_DEBT_METER_MAX_AGE_MS)
  const stale = await prisma.debtVehicleVisit.findMany({
    where: {
      vehiclePhotoId: null,
      meterPhotoId: { not: null },
      visitDate: { lt: cutoff },
    },
    take: 10,
  })
  if (stale.length === 0) return 0

  const stations = new Map(
    (
      await prisma.station.findMany({
        where: { id: { in: stale.map((v) => v.stationId) } },
        select: { id: true, code: true },
      })
    ).map((s) => [s.id, s.code])
  )

  let moved = 0
  for (const visit of stale) {
    if (stations.get(visit.stationId) === 'UNKNOWN') continue
    // Claim by delete: a concurrent sweep (or a late-pairing vehicle photo)
    // that already touched this visit makes the count 0 and we skip it.
    const claimed = await prisma.debtVehicleVisit.deleteMany({
      where: { id: visit.id, vehiclePhotoId: null },
    })
    if (claimed.count === 0) continue
    try {
      const photo = await prisma.shiftPhoto.findUnique({ where: { id: visit.meterPhotoId! } })
      if (!photo?.storagePath) continue
      const url = await getSignedUrl(photo.storagePath)
      const buffer = Buffer.from(await (await fetch(url)).arrayBuffer())
      const ts = photo.zaloReceivedAt?.getTime() ?? photo.createdAt.getTime()
      const shift = await findOrCreateShift(visit.stationId, ts)
      await prisma.shiftPhoto.update({ where: { id: photo.id }, data: { shiftId: shift.id } })
      // Force the electronic branch: re-running the router would just repeat
      // the debt misclassification that stranded the photo here.
      await runShiftExtraction(
        photo.id,
        buffer,
        { id: shift.id, stationId: visit.stationId },
        undefined,
        {
          image_type: 'electronic_meter',
          confidence: 90,
          notes: 'stray debt-meter rerouted to shift after unpaired timeout',
        }
      )
      moved++
      logger.info(
        { photoId: photo.id, visitId: visit.id, station: stations.get(visit.stationId) },
        'Unpaired debt meter rerouted to shift closing'
      )
    } catch (error) {
      logger.error({ error, visitId: visit.id }, 'Stray debt-meter reroute failed; restoring visit')
      // Put the visit back so the photo stays reachable in the debt queue.
      const { id: _id, createdAt: _createdAt, aiRawResponse, ...rest } = visit
      await prisma.debtVehicleVisit
        .create({
          data: {
            ...rest,
            aiRawResponse: aiRawResponse === null ? Prisma.JsonNull : aiRawResponse,
          },
        })
        .catch((restoreError) =>
          logger.error({ error: restoreError, visitId: visit.id }, 'Visit restore failed')
        )
    }
  }
  return moved
}
