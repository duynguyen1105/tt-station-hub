import { Prisma } from '@/lib/generated/prisma/client'
import { logger } from '@/lib/logger'
import { DEBT_PAIR_WINDOW_MS } from '@/lib/matching/visit-pairing'
import {
  findOrCreateShift,
  runShiftExtraction,
  shiftDateFor,
  shiftTypeFor,
} from '@/lib/photos/ingest'
import { prisma } from '@/lib/prisma'
import { downloadPhoto } from '@/lib/storage/photo-storage'

// A meter-only visit is only stray once its vehicle photo can no longer join it:
// findOpenHalf pairs inside DEBT_PAIR_WINDOW_MS of the visit, so anything older
// is definitively unpaired. The earlier 60s cutoff stole the pump half of fills
// whose vehicle photo was still on its way.
const STRAY_DEBT_METER_MAX_AGE_MS = DEBT_PAIR_WINDOW_MS

/**
 * Reroutes stale meter-only debt visits into the shift-closing pipeline.
 *
 * Premise, stated so it can be checked: a per-fill display reconciles
 * TIỀN = LÍT × ĐƠN GIÁ; a cumulative totalizer either contradicts its money line
 * (3-line green display: last sale's tiền beside cumulative lít) or has none
 * (Montech/LungBor single number). So an unpaired pump photo whose read
 * contradicts the money line, or that shows no money and no price line at all,
 * is a totalizer the router or a debt declaration misfiled — the very photo the
 * ca is missing (report #5/#7). One that reconciled, or that could not be checked
 * but still shows a money or price line, is the money half of a real fill whose
 * vehicle photo went missing; it stays in the debt queue for the reviewer, never
 * becomes a reading.
 *
 * Skipped: visits a human has touched (decided, reviewed, or given a customer),
 * UNKNOWN-station visits (the review card is where their station dropdown
 * lives), and visits whose ca is already chốt'd — a reading must not appear in a
 * closed ca behind the reviewer's back.
 *
 * Called opportunistically (end of each webhook, review page loads) — there is
 * no cron on this deployment.
 */
export async function sweepStrayDebtMeters(): Promise<number> {
  const cutoff = new Date(Date.now() - STRAY_DEBT_METER_MAX_AGE_MS)
  const stale = await prisma.debtVehicleVisit.findMany({
    where: {
      vehiclePhotoId: null,
      meterPhotoId: { not: null },
      visitDate: { lt: cutoff },
      // A read that contradicts the money line, or one with no money/price line at
      // all (a single-number totalizer). A fill whose price merely glared out still
      // shows a money line and stays for the reviewer — an amount owed must never
      // be deleted on a hunch.
      OR: [
        { amountMatchesDisplay: false },
        { amountMatchesDisplay: null, unitPriceRead: null, displayedAmount: null },
      ],
      reviewStatus: { in: ['pending', 'needs_review'] },
      reviewedBy: null,
      customerId: null,
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
    const photo = await prisma.shiftPhoto.findUnique({ where: { id: visit.meterPhotoId! } })
    if (!photo?.storagePath) continue
    const ts = photo.zaloReceivedAt?.getTime() ?? photo.createdAt.getTime()
    const closed = await prisma.shift.findUnique({
      where: {
        stationId_shiftDate_shiftType: {
          stationId: visit.stationId,
          shiftDate: shiftDateFor(ts),
          shiftType: shiftTypeFor(),
        },
      },
      select: { status: true },
    })
    if (closed?.status === 'completed') continue
    // Claim by delete: a concurrent sweep (or a late-pairing vehicle photo)
    // that already touched this visit makes the count 0 and we skip it.
    const claimed = await prisma.debtVehicleVisit.deleteMany({
      where: { id: visit.id, vehiclePhotoId: null },
    })
    if (claimed.count === 0) continue
    try {
      const buffer = await downloadPhoto(photo.storagePath)
      const shift = await findOrCreateShift(visit.stationId, ts)
      await prisma.shiftPhoto.update({ where: { id: photo.id }, data: { shiftId: shift.id } })
      // Force the electronic branch: re-running the router would just repeat
      // the debt misclassification that stranded the photo here. The electronic
      // reader still escapes to the mechanical one when it sees digit wheels.
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
