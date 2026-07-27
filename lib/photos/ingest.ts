import { randomUUID } from 'crypto'

import { classifyDebt } from '@/lib/ai/confidence'
import { extractMeter } from '@/lib/ai/extract-meter'
import { extractTankDip } from '@/lib/ai/extract-tank-dip'
import { extractPlate, extractVisitMeter, parseNumericString } from '@/lib/ai/extract-visit'
import {
  type ExtractMeterResult,
  type ExtractPlateResult,
  type ExtractTankDipResult,
  type ExtractVisitResult,
  type RouterResult,
} from '@/lib/ai/types'
import { plateListContains } from '@/lib/debts/plate'
import { FuelArea, Prisma } from '@/lib/generated/prisma/client'
import { reserveDipExceedsTolerance } from '@/lib/inventory/tank-dip-rule'
import { logger } from '@/lib/logger'
import { ANOMALY_REASONS, DEFAULT_ANOMALY_CONFIG } from '@/lib/matching/anomaly-detection'
import {
  dotlessMontechCorrection,
  meterTypeRank,
  resolveDuplicateSlot,
} from '@/lib/matching/duplicate-check'
import {
  type MeterSlot,
  matchPhotoToDispenser,
  pickDispenserByFuel,
} from '@/lib/matching/photo-to-reading'
import { deriveReviewState } from '@/lib/matching/review-state'
import { getOrCreateUnknownStation, matchStationByLabel } from '@/lib/matching/station-label'
import { submitterKey } from '@/lib/matching/submitter'
import { DEBT_PAIR_WINDOW_MS } from '@/lib/matching/visit-pairing'
import { resolveVisitStation } from '@/lib/matching/visit-station'
import { inferFuelTypeFromPrice } from '@/lib/misa-export/build-sales-voucher'
import { prisma } from '@/lib/prisma'
import { uploadPhoto } from '@/lib/storage/photo-storage'
import { type ZaloMessageKind, classifyZaloMessage } from '@/lib/zalo/classify'

type ShiftRef = { id: string; stationId: string }

// Optional manual assignment from the upload form: force the pump/meter slot when
// the AI can't read the label (e.g. a Lungbor LCD with no plate in frame).
export type ManualOverride = { dispenserId?: string | null; slot?: MeterSlot | null }

// A per-trip debt photo is either the pump meter (liters + unit price) or the vehicle plate.
export type DebtPhotoType = 'debt_meter' | 'vehicle'

function vietnamParts(timestamp: number) {
  const shifted = new Date(timestamp + 7 * 60 * 60 * 1000)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  }
}

export function shiftDateFor(timestamp: number): Date {
  const p = vietnamParts(timestamp)
  return new Date(Date.UTC(p.year, p.month, p.day))
}

// One shift per calendar day (GMT+7): stations close their shift around 15:00,
// so every photo sent during a day — including late sends in the evening —
// belongs to that day's single shift and is never split across time windows.
export function shiftTypeFor(): 'full_day' {
  return 'full_day'
}

/** Finds the open shift for a station+window, or creates a fresh one. */
export async function findOrCreateShift(stationId: string, timestamp: number) {
  const shiftDate = shiftDateFor(timestamp)
  const shiftType = shiftTypeFor()
  const key = { stationId, shiftDate, shiftType }

  const existing = await prisma.shift.findUnique({
    where: { stationId_shiftDate_shiftType: key },
  })
  if (existing) return existing

  // When many photos arrive at once each webhook races to create the shift. The
  // (station, date, type) unique constraint guarantees only one create wins; the
  // losers catch the violation (P2002) and read back the shift the winner made.
  try {
    return await prisma.shift.create({
      data: { stationId, shiftDate, shiftType, status: 'collecting_photos' },
    })
  } catch (error) {
    if (error instanceof Error && (error as { code?: string }).code === 'P2002') {
      const won = await prisma.shift.findUnique({
        where: { stationId_shiftDate_shiftType: key },
      })
      if (won) return won
    }
    throw error
  }
}

const num = (value: unknown): number | null => (value == null ? null : Number(value))

/**
 * Matches an extracted shift photo to a dispenser meter, upserts the
 * `shift_readings` row (filling the electronic or mechanical slot), derives the
 * review state, links the photo, and advances the shift out of
 * `collecting_photos`. This is the build-plan §2.2 assembly step that turns a
 * stored+read photo into a reviewable reading.
 */
async function assembleShiftReading(
  photoId: string,
  shift: ShiftRef,
  result: ExtractMeterResult,
  override?: ManualOverride
): Promise<void> {
  const dispensers = await prisma.dispenser.findMany({
    where: { stationId: shift.stationId, isActive: true },
    orderBy: { displayOrder: 'asc' },
  })

  const match = matchPhotoToDispenser(
    { extractedDispenserCode: result.dispenserLabel, meterType: result.meterType },
    dispensers.map((d) => ({ id: d.id, code: d.code }))
  )

  // A manual override (chosen pump/meter) wins over the AI-label match — this is
  // how label-less photos (e.g. a Lungbor LCD with no plate) still land correctly.
  let dispenserId = override?.dispenserId ?? (match.status === 'matched' ? match.dispenserId : null)
  const slot = override?.slot ?? match.slot
  let matchStatus = override?.dispenserId ? 'matched' : match.status

  // Fuel fallback: some pumps carry only a fuel sticker ("URE" at DakNong1 —
  // no station or TRỤ line at all). When the photo has NO dispenser label but a
  // known fuel, match by fuel: a unique pump takes it directly; several pumps
  // are told apart by whichever last totalizer reading is nearest (totals only
  // creep upward), or by the first slot still free this shift on day one.
  if (!dispenserId && !override?.dispenserId && !result.dispenserLabel && result.fuelType && slot) {
    const readings = await prisma.shiftReading.findMany({ where: { shiftId: shift.id } })
    const occupied = new Set(
      readings
        .filter((r) => (slot === 'electronic' ? r.electronicPhotoId : r.mechanicalPhotoId))
        .map((r) => r.dispenserId)
    )
    const picked = pickDispenserByFuel(
      dispensers.map((d) => ({
        id: d.id,
        fuelType: d.fuelType,
        lastElectronicReading: num(d.lastElectronicReading),
      })),
      result.fuelType,
      parseNumericString(result.reading),
      occupied
    )
    if (picked) {
      dispenserId = picked
      matchStatus = 'matched'
    }
  }

  await prisma.shiftPhoto.update({ where: { id: photoId }, data: { matchStatus } })

  const dispenser = dispenserId ? dispensers.find((d) => d.id === dispenserId) : undefined

  if (dispenser && slot) {
    // Read-compute-upsert must be atomic: with many photos arriving at once, the
    // electronic and mechanical photo of the SAME dispenser are processed by
    // parallel webhook invocations writing the same row. A transaction-scoped
    // advisory lock keyed by (shift, dispenser) makes concurrent writers QUEUE
    // behind each other (instead of Serializable's abort-and-retry roulette, which
    // dropped slots under a 12-photo burst). The lock releases at commit/rollback
    // and is pooler-safe (one connection per transaction). Retries with jittered
    // backoff remain as a belt-and-braces for transient failures.
    let row: { id: string } | undefined
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        row = await prisma.$transaction(
          async (tx) => {
            // Wrapped in a subquery because pg_advisory_xact_lock returns void,
            // which Prisma's raw deserializer rejects — the outer SELECT yields int.
            await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`${shift.id}:${dispenser.id}`}, 0)) AS l) AS t`
            const existing = await tx.shiftReading.findUnique({
              where: { shiftId_dispenserId: { shiftId: shift.id, dispenserId: dispenser.id } },
            })
            const reading = parseNumericString(result.reading)
            const conf = result.readingConfidence

            // Staff shoot the same totalizer twice on purpose to cross-check.
            // Agreeing duplicates confirm the read; diverging ones keep the
            // value of the more reliable display (Montech > green 3-line),
            // then higher confidence, and force review (mismatch flag below).
            const priorSlot =
              slot === 'electronic'
                ? {
                    value: num(existing?.electronicReading),
                    conf: existing?.aiElectronicConfidence ?? null,
                    photoId: existing?.electronicPhotoId ?? null,
                  }
                : {
                    value: num(existing?.mechanicalReading),
                    conf: existing?.aiMechanicalConfidence ?? null,
                    photoId: existing?.mechanicalPhotoId ?? null,
                  }
            const priorPhoto = priorSlot.photoId
              ? await tx.shiftPhoto.findUnique({
                  where: { id: priorSlot.photoId },
                  select: { meterType: true },
                })
              : null
            const resolved = resolveDuplicateSlot(
              { ...priorSlot, rank: meterTypeRank(priorPhoto?.meterType) },
              { value: reading, conf, photoId, rank: meterTypeRank(result.meterType) }
            )

            const elecReading =
              slot === 'electronic' ? resolved.value : num(existing?.electronicReading)
            const mechReading =
              slot === 'mechanical' ? resolved.value : num(existing?.mechanicalReading)
            const elecConf =
              slot === 'electronic' ? resolved.conf : (existing?.aiElectronicConfidence ?? null)
            const mechConf =
              slot === 'mechanical' ? resolved.conf : (existing?.aiMechanicalConfidence ?? null)
            const elecPhoto =
              slot === 'electronic' ? resolved.photoId : (existing?.electronicPhotoId ?? null)
            const mechPhoto =
              slot === 'mechanical' ? resolved.photoId : (existing?.mechanicalPhotoId ?? null)

            // Snapshot the opening from the dispenser's last-reading cache the first
            // time this reading is assembled; a re-ingested photo (or an opening the
            // accountant has already entered) keeps the value it already has.
            const openElec =
              num(existing?.openingElectronicReading) ?? num(dispenser.lastElectronicReading)
            const openMech =
              num(existing?.openingMechanicalReading) ?? num(dispenser.lastMechanicalReading)

            // A dotless Montech read may have lost its decimal dot — but only
            // reinterpret /100 when the opening proves the raw value impossible
            // (see dotlessMontechCorrection; not every Montech has decimals).
            const winnerType =
              resolved.photoId === photoId ? result.meterType : priorPhoto?.meterType
            let elecFinal = elecReading
            if (slot === 'electronic' && winnerType === 'electronic_montech') {
              elecFinal =
                dotlessMontechCorrection(
                  elecReading,
                  openElec,
                  DEFAULT_ANOMALY_CONFIG.maxDeltaLiters
                ) ?? elecReading
            }

            const derived = deriveReviewState(
              {
                electronicReading: elecFinal,
                mechanicalReading: mechReading,
                openingElectronicReading: openElec,
                openingMechanicalReading: openMech,
                electronicConfidence: elecConf,
                mechanicalConfidence: mechConf,
                hasElectronicMeter: dispenser.hasElectronicMeter,
                hasMechanicalMeter: dispenser.hasMechanicalMeter,
                hasElectronicPhoto: elecPhoto != null,
                hasMechanicalPhoto: mechPhoto != null,
              },
              DEFAULT_ANOMALY_CONFIG
            )
            // A diverging duplicate can never auto-approve: the accountant must
            // compare both photos before signing the number off.
            const review = resolved.mismatch
              ? {
                  isAnomaly: true,
                  anomalyReasons: [
                    ...derived.anomalyReasons,
                    ANOMALY_REASONS.duplicatePhotoMismatch,
                  ],
                  reviewStatus: 'needs_review',
                }
              : derived

            const data = {
              openingElectronicReading: openElec,
              openingMechanicalReading: openMech,
              electronicReading: elecFinal,
              mechanicalReading: mechReading,
              electronicPhotoId: elecPhoto,
              mechanicalPhotoId: mechPhoto,
              aiElectronicConfidence: elecConf,
              aiMechanicalConfidence: mechConf,
              isAnomaly: review.isAnomaly,
              anomalyReasons: review.anomalyReasons,
              reviewStatus: review.reviewStatus,
              // Preserve the first AI value so a later correction can show the original.
              originalElectronicReading:
                num(existing?.originalElectronicReading) ??
                (slot === 'electronic' ? reading : null),
              originalMechanicalReading:
                num(existing?.originalMechanicalReading) ??
                (slot === 'mechanical' ? reading : null),
            }

            return tx.shiftReading.upsert({
              where: { shiftId_dispenserId: { shiftId: shift.id, dispenserId: dispenser.id } },
              create: { shiftId: shift.id, dispenserId: dispenser.id, ...data },
              update: data,
            })
          },
          // A burst can queue several writers on one dispenser's lock — give the
          // queue room to drain instead of timing out the transaction.
          { timeout: 15000 }
        )
        break
      } catch (error) {
        const code = (error as { code?: string }).code
        if ((code === 'P2034' || code === 'P2002') && attempt < 5) {
          // Jittered backoff so retriers don't re-collide in lockstep.
          await new Promise((r) => setTimeout(r, 100 * attempt + Math.floor(Math.random() * 150)))
          continue
        }
        // Surface the drop honestly: the photo stays visible as unmatched instead
        // of a misleading 'matched' with no reading attached.
        await prisma.shiftPhoto
          .update({ where: { id: photoId }, data: { matchStatus: 'unmatched' } })
          .catch(() => {})
        throw error
      }
    }
    if (row) {
      await prisma.shiftPhoto.update({
        where: { id: photoId },
        data: { matchStatus: 'matched', matchedReadingId: row.id },
      })
    }
  }

  // Advance the shift out of "collecting photos" now that AI has processed a photo.
  const pendingCount = await prisma.shiftReading.count({
    where: { shiftId: shift.id, reviewStatus: { in: ['pending', 'needs_review'] } },
  })
  await prisma.shift.update({
    where: { id: shift.id },
    data: {
      status: 'pending_review',
      totalDispensers: dispensers.length,
      readingsPendingReviewCount: pendingCount,
      photosUploadedCount: { increment: 1 },
    },
  })
}

/** Runs the shift meter extraction, persists the AI draft, then assembles the reading. */
export async function runShiftExtraction(
  photoId: string,
  buffer: Buffer,
  shift: ShiftRef,
  override?: ManualOverride,
  router?: RouterResult,
  // A result already extracted upstream (e.g. while identifying the station from
  // the photo's printed label) — reused here to avoid a second AI pass.
  precomputed?: ExtractMeterResult
): Promise<ExtractMeterResult> {
  const result = precomputed ?? (await extractMeter({ imageBuffer: buffer, router }))
  await prisma.shiftPhoto.update({
    where: { id: photoId },
    data: {
      aiProcessedAt: new Date(),
      meterType: result.meterType,
      extractedReading: parseNumericString(result.reading),
      extractedStationCode: result.stationLabel,
      extractedDispenserCode: result.dispenserLabel,
      extractedFuelType: result.fuelType,
      aiConfidence: result.readingConfidence,
      aiRawResponse: result.raw as Prisma.InputJsonValue,
    },
  })
  await assembleShiftReading(photoId, shift, result, override)
  return result
}

/** Debt review status from the weakest of liters/unit-price confidence + the §5.6 amount check. */
function debtReview(meter: ExtractVisitResult): { reviewStatus: string; anomalies: string[] } {
  const anomalies: string[] = []
  if (meter.amountMatchesDisplay === false) anomalies.push('amount_mismatch')
  const confs = [meter.litersConfidence, meter.unitPriceConfidence].filter(
    (c): c is number => c != null
  )
  const conf = confs.length ? Math.min(...confs) : null
  if (anomalies.length || conf == null) return { reviewStatus: 'needs_review', anomalies }
  // A debt visit always needs a human to assign the customer + approve (that is what
  // posts the charge), so never auto-approve — a confident read still waits in the
  // queue as 'pending', a weak one as 'needs_review'.
  const reviewStatus = classifyDebt(conf) === 'needs_review' ? 'needs_review' : 'pending'
  return { reviewStatus, anomalies }
}

const KNOWN_FUEL_TYPES = new Set(['DO', 'E0', 'DC', 'XANG_A95', 'URE'])

/** Accepts the AI-read fuel label only if it is one of the known fuel codes, else null. */
function normalizeFuelType(raw: string | null | undefined): string | null {
  if (!raw) return null
  const code = raw.trim().toUpperCase()
  return KNOWN_FUEL_TYPES.has(code) ? code : null
}

/**
 * The pairing key, stated once for both assembly branches: this submitter's open
 * half of a fill, inside the window, still missing the kind of photo that has just
 * arrived. Stated once so the two branches can never drift into two different
 * definitions of a pair.
 *
 * The station is deliberately NOT part of the key — the two halves of one fill
 * resolve it independently and can disagree, which is exactly what used to split
 * them. See docs/adr/0001-pair-debt-photos-by-submitter.md.
 *
 * A photo with no identifiable submitter has no key and so pairs with nothing: an
 * absent submitter must never match another absent submitter.
 *
 * One indexed query (idx_visits_submitter). It runs holding the global pairing lock
 * every debt photo queues behind, so a scan here stalls all debt intake, not one visit.
 */
async function findOpenHalf(
  tx: Prisma.TransactionClient,
  arriving: DebtPhotoType,
  submittedBy: string | null,
  windowStart: Date
) {
  if (!submittedBy) return null
  const missing =
    arriving === 'debt_meter'
      ? { meterPhotoId: null, vehiclePhotoId: { not: null } }
      : { vehiclePhotoId: null, meterPhotoId: { not: null } }
  return tx.debtVehicleVisit.findFirst({
    where: { submittedBy, ...missing, visitDate: { gte: windowStart } },
    orderBy: { visitDate: 'desc' },
  })
}

/**
 * Per-trip debt counterpart to assembleShiftReading: reads the photo (meter ->
 * liters + unit price + computed amount; or vehicle -> plate), then upserts a
 * `debt_vehicle_visit`, pairing a meter photo with a recent vehicle photo (or
 * vice-versa) from the SAME SUBMITTER within a 5-min window (build plan §4.2). A
 * vehicle plate is cross-checked against known customer plates to auto-assign.
 *
 * The pairing key is the submitter, never the station: the two halves of one fill
 * resolve their station independently and can disagree, but they always agree on
 * who sent them. See docs/adr/0001-pair-debt-photos-by-submitter.md.
 */
export async function assembleDebtVisit(params: {
  photoId: string
  station: { id: string }
  timestamp: number
  type: DebtPhotoType
  buffer: Buffer
  // The pairing key: who handed this photo in, namespaced by intake door
  // (see lib/matching/submitter.ts). Null when no submitter is identifiable, in
  // which case the photo opens its own visit rather than joining a stranger's.
  submittedBy: string | null
  // Zalo message text sent with the photo — stored on the visit for the reviewer.
  caption?: string | null
  // A meter result already extracted upstream (station identification) — reused
  // here to avoid a second AI pass.
  precomputedMeter?: ExtractVisitResult
}): Promise<{
  visitId: string
  meter: ExtractVisitResult | null
  plate: ExtractPlateResult | null
}> {
  const { photoId, station, timestamp, type, buffer, submittedBy } = params
  const caption = params.caption?.trim() || null
  const visitDate = new Date(timestamp)
  const windowStart = new Date(timestamp - DEBT_PAIR_WINDOW_MS)

  if (type === 'debt_meter') {
    const meter = params.precomputedMeter ?? (await extractVisitMeter({ imageBuffer: buffer }))
    await prisma.shiftPhoto.update({
      where: { id: photoId },
      data: {
        aiProcessedAt: new Date(),
        meterType: meter.meterType,
        aiConfidence: meter.amountConfidence,
        aiRawResponse: meter.raw as Prisma.InputJsonValue,
      },
    })
    const { reviewStatus, anomalies } = debtReview(meter)
    const unitPriceRead = parseNumericString(meter.unitPrice)
    // Prefer the fuel type read off the printed pump label ("TRỤ 1 – DO"): it is the
    // ground truth and, unlike a price, is unaffected by contract/debt pricing. Fall
    // back to inferring from the pump price via the station's fuel area retail prices, and
    // finally to null (the accountant sets it in review).
    const labelFuel = normalizeFuelType(meter.fuelType)
    // The pump plate often names the STATION too ("ĐAKNONG 1 / TRỤ 1 – DO") — let it
    // override the sender's station, mirroring shift photos. The reviewer can still
    // change the station manually on the review card.
    let target = station
    let stationFromPumpPlate = false
    if (meter.stationLabel) {
      const byLabel = await matchStationByLabel(meter.stationLabel)
      if (byLabel) {
        stationFromPumpPlate = true
        if (byLabel.id !== station.id) {
          logger.info(
            { from: station.id, to: byLabel.code, label: meter.stationLabel },
            'Debt visit station label overrides sender station'
          )
        }
        target = { id: byLabel.id }
      }
    }
    // Retail prices are keyed by the station's fuel area (retail zone), not by station.
    const stationRow = await prisma.station.findUnique({
      where: { id: target.id },
      select: { fuelArea: true },
    })
    const priceRows = await prisma.misaRetailPrice.findMany({
      where: { fuelArea: stationRow?.fuelArea ?? FuelArea.FUEL_AREA_1 },
    })
    const prices = priceRows.map((p) => ({
      fuelType: p.fuelType,
      effectiveDate: p.effectiveDate,
      unitPrice: p.unitPrice.toNumber(),
    }))
    const meterData = {
      litersRead: parseNumericString(meter.liters),
      unitPriceRead,
      fuelType:
        labelFuel ??
        (unitPriceRead !== null ? inferFuelTypeFromPrice(unitPriceRead, prices, visitDate) : null),
      displayedAmount: parseNumericString(meter.displayedAmount),
      computedAmount: meter.computedAmount,
      amountMatchesDisplay: meter.amountMatchesDisplay,
      meterPhotoId: photoId,
      aiConfidence: meter.amountConfidence,
      aiRawResponse: meter.raw as Prisma.InputJsonValue,
      anomalyReasons: anomalies,
      reviewStatus,
      // Keep an existing caption when this photo carries none.
      ...(caption ? { zaloCaption: caption } : {}),
    }
    // Pair with this submitter's recent vehicle-only visit, else open a new one.
    // The whole find-or-create runs under a global debt-pairing advisory lock: Zalo
    // delivers the vehicle and pump photo of ONE fill as parallel webhooks, and
    // without the lock both sides see "no open visit" and create two visits instead
    // of one. Debt volume is low, so one global queue is plenty.
    const unknownStation = await getOrCreateUnknownStation()
    const visit = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtextextended(${'debt-pairing'}, 0)) AS l) AS t`
        const open = await findOpenHalf(tx, 'debt_meter', submittedBy, windowStart)
        return open
          ? tx.debtVehicleVisit.update({
              where: { id: open.id },
              data: {
                stationId: resolveVisitStation({
                  visitStationId: open.stationId,
                  photoStationId: target.id,
                  stationFromPumpPlate,
                  unknownStationId: unknownStation.id,
                }),
                ...meterData,
              },
            })
          : tx.debtVehicleVisit.create({
              data: { stationId: target.id, visitDate, submittedBy, ...meterData },
            })
      },
      { timeout: 15000 }
    )
    return { visitId: visit.id, meter, plate: null }
  }

  // Vehicle / plate photo.
  const plate = await extractPlate({ imageBuffer: buffer })
  await prisma.shiftPhoto.update({
    where: { id: photoId },
    data: {
      aiProcessedAt: new Date(),
      meterType: 'vehicle',
      aiConfidence: plate.confidence,
      aiRawResponse: { plate: plate.plate, confidence: plate.confidence } as Prisma.InputJsonValue,
    },
  })
  // Plate formats vary between the AI read and human entry ("50E-751.91" vs
  // "50E75191"), so matching compares normalized forms instead of exact strings.
  let customer: { id: string } | null = null
  if (plate.plate) {
    const candidates = await prisma.debtCustomer.findMany({
      where: { stationId: station.id, isActive: true },
      select: { id: true, knownPlates: true },
    })
    customer = candidates.find((c) => plateListContains(c.knownPlates, plate.plate)) ?? null
  }
  // Same global pairing lock and same key as the meter branch (see the comment
  // there). A pump photo that landed first is found wherever its plate put it —
  // including a station this sender has never been registered to.
  const unknownStation = await getOrCreateUnknownStation()
  const visit = await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtextextended(${'debt-pairing'}, 0)) AS l) AS t`
      const open = await findOpenHalf(tx, 'vehicle', submittedBy, windowStart)
      return open
        ? tx.debtVehicleVisit.update({
            where: { id: open.id },
            data: {
              // A vehicle photo has no pump plate to read a station off, so it only
              // ever carries an inherited guess and never overwrites what the visit
              // already concluded.
              stationId: resolveVisitStation({
                visitStationId: open.stationId,
                photoStationId: station.id,
                stationFromPumpPlate: false,
                unknownStationId: unknownStation.id,
              }),
              vehiclePhotoId: photoId,
              plateRead: plate.plate,
              customerId: open.customerId ?? customer?.id ?? null,
              ...(caption ? { zaloCaption: caption } : {}),
            },
          })
        : tx.debtVehicleVisit.create({
            data: {
              stationId: station.id,
              visitDate,
              submittedBy,
              vehiclePhotoId: photoId,
              plateRead: plate.plate,
              customerId: customer?.id ?? null,
              reviewStatus: 'needs_review',
              zaloCaption: caption,
            },
          })
    },
    { timeout: 15000 }
  )
  return { visitId: visit.id, meter: null, plate }
}

/**
 * Reads a tank-dip (barem) photo, records it on the photo, and appends a
 * per-tank dip history record. A RESERVE tank (one no active dispenser draws
 * from — derived, not configured) must hold still between dips, so a change
 * beyond tolerance is flagged 'reserve_stock_changed' for review.
 */
export async function ingestTankDip(
  photoId: string,
  buffer: Buffer,
  // A result already extracted upstream (station identification) — reused here.
  precomputed?: ExtractTankDipResult,
  station?: { id: string } | null
): Promise<ExtractTankDipResult> {
  const result = precomputed ?? (await extractTankDip({ imageBuffer: buffer }))
  const photo = await prisma.shiftPhoto.update({
    where: { id: photoId },
    data: {
      aiProcessedAt: new Date(),
      meterType: 'tank_dip',
      aiConfidence: result.confidence,
      extractedFuelType: result.fuelType,
      aiRawResponse: result.raw as Prisma.InputJsonValue,
    },
  })

  const tankNumber = result.tankNumber ?? result.tankLabel?.match(/(\d+)/)?.[1] ?? null
  const dip = parseNumericString(result.dipValue)
  if (!station || !tankNumber || dip === null) return result

  const tankCode = `HAM_${Number.parseInt(tankNumber, 10)}`
  const attachedDispensers = await prisma.dispenser.count({
    where: { stationId: station.id, tankCode, isActive: true },
  })
  const isReserve = attachedDispensers === 0
  const previous = await prisma.tankDipRecord.findFirst({
    where: { stationId: station.id, tankCode },
    orderBy: { measuredAt: 'desc' },
  })
  const delta = previous ? dip - Number(previous.dipValue) : null
  const isAnomaly =
    isReserve && previous !== null && reserveDipExceedsTolerance(Number(previous.dipValue), dip)

  await prisma.tankDipRecord.create({
    data: {
      stationId: station.id,
      tankCode,
      fuelType: result.fuelType,
      capacityK: result.capacityK,
      dipValue: dip,
      isReserve,
      deltaFromPrevious: delta,
      isAnomaly,
      anomalyReason: isAnomaly ? 'reserve_stock_changed' : null,
      photoId,
      measuredAt: photo.zaloReceivedAt ?? photo.createdAt,
    },
  })
  if (isAnomaly) {
    logger.warn(
      { stationId: station.id, tankCode, dip, previous: previous?.dipValue?.toString(), delta },
      'Reserve tank dip moved beyond tolerance'
    )
  }
  return result
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/webp': 'webp',
}

// Manual upload categories: shift/debt come from Zalo classification; inventory
// (tank dip) is an explicit web-upload choice only.
export type ManualPhotoKind = ZaloMessageKind | 'inventory'

export type ManualIngestResult = {
  photoId: string
  kind: ManualPhotoKind
  storagePath: string
  shiftId: string | null
  shift: ExtractMeterResult | null
  debt: ExtractVisitResult | null
  plate: ExtractPlateResult | null
  tankDip: ExtractTankDipResult | null
  visitId: string | null
  extractionError: string | null
}

/**
 * Manual (web) counterpart to the Zalo webhook: stores an uploaded photo and runs
 * the same AI extraction pipeline, so the store -> AI -> review flow can be
 * exercised without Zalo. Extraction is awaited (the caller wants the result),
 * and a failed read never discards the already-stored photo.
 */
export async function ingestManualPhoto(params: {
  station: { id: string; code: string }
  buffer: Buffer
  contentType: string
  caption: string | null
  // The signed-in uploader — the submitter for this door, and so the key that
  // pairs the two halves of a debt fill uploaded by hand.
  userId: string
  kind?: ManualPhotoKind
  override?: ManualOverride
  debtType?: DebtPhotoType
}): Promise<ManualIngestResult> {
  const kind = params.kind ?? classifyZaloMessage(params.caption)
  const ext = EXT_BY_TYPE[params.contentType] ?? 'jpg'
  const path = `${params.station.code}/${kind}/upload-${randomUUID()}.${ext}`
  await uploadPhoto(path, params.buffer, params.contentType)

  const shift = kind === 'shift' ? await findOrCreateShift(params.station.id, Date.now()) : null

  const photo = await prisma.shiftPhoto.create({
    data: {
      shiftId: shift?.id ?? null,
      source: 'web_upload',
      storageUrl: path,
      storagePath: path,
      fileSizeBytes: params.buffer.byteLength,
      matchStatus: 'unmatched',
    },
  })

  let shift_result: ExtractMeterResult | null = null
  let debt_result: ExtractVisitResult | null = null
  let plate_result: ExtractPlateResult | null = null
  let tank_result: ExtractTankDipResult | null = null
  let visitId: string | null = null
  let extractionError: string | null = null
  try {
    if (kind === 'shift' && shift) {
      shift_result = await runShiftExtraction(
        photo.id,
        params.buffer,
        { id: shift.id, stationId: params.station.id },
        params.override
      )
    } else if (kind === 'inventory') {
      tank_result = await ingestTankDip(photo.id, params.buffer, undefined, params.station)
    } else {
      const visit = await assembleDebtVisit({
        photoId: photo.id,
        station: { id: params.station.id },
        timestamp: Date.now(),
        type: params.debtType ?? 'debt_meter',
        buffer: params.buffer,
        caption: params.caption,
        submittedBy: submitterKey('app', params.userId),
      })
      debt_result = visit.meter
      plate_result = visit.plate
      visitId = visit.visitId
    }
  } catch (error) {
    logger.error({ error, photoId: photo.id }, 'Manual upload extraction failed')
    extractionError = error instanceof Error ? error.message : 'extraction failed'
  }

  return {
    photoId: photo.id,
    kind,
    storagePath: path,
    shiftId: shift?.id ?? null,
    shift: shift_result,
    debt: debt_result,
    plate: plate_result,
    tankDip: tank_result,
    visitId,
    extractionError,
  }
}
