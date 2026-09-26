import { classifyDebt } from '@/lib/ai/confidence'
import { extractMeter } from '@/lib/ai/extract-meter'
import { extractTankDip } from '@/lib/ai/extract-tank-dip'
import { extractPlate, extractVisitMeter, parseNumericString } from '@/lib/ai/extract-visit'
import {
  type ExtractMeterResult,
  type ExtractTankDipResult,
  type ExtractVisitResult,
  type RouterResult,
} from '@/lib/ai/types'
import { priceMismatchOf } from '@/lib/debts/board-price'
import { loadStationPrices } from '@/lib/debts/load-board-prices'
import { plateListContains } from '@/lib/debts/plate'
import { tankCodeFor } from '@/lib/dispensers/naming'
import { withTanks } from '@/lib/dispensers/tank-links'
import { resolveStationPlateFuel } from '@/lib/fuels/load-catalogue'
import { Prisma } from '@/lib/generated/prisma/client'
import { parseVnNumber } from '@/lib/imports/bien-ban'
import { countableDipWhere } from '@/lib/inventory/dip-review'
import { planDipRewire } from '@/lib/inventory/tank-dip-rule'
import { tankFuelFrom } from '@/lib/inventory/tank-fuel'
import { logger } from '@/lib/logger'
import { ANOMALY_REASONS, DEFAULT_ANOMALY_CONFIG } from '@/lib/matching/anomaly-detection'
import {
  type ScaleResolution,
  meterTypeRank,
  resolveDuplicateSlot,
  resolveReadingScale,
} from '@/lib/matching/duplicate-check'
import {
  type MeterSlot,
  matchPhotoToDispenser,
  pickDispenserByFuel,
} from '@/lib/matching/photo-to-reading'
import { deriveReviewState } from '@/lib/matching/review-state'
import { matchStationByLabel } from '@/lib/matching/station-label'
import { inferFuelTypeFromPrice } from '@/lib/misa-export/build-sales-voucher'
import { prisma } from '@/lib/prisma'
import { openingReadingsFor } from '@/lib/shifts/opening-reading'

type ShiftRef = { id: string; stationId: string }

// Manual assignment by a reviewer (POST /api/photos/[id]/assign): force the
// pump/meter slot when the AI can't read the label (e.g. a Lungbor LCD with no
// plate in frame, or a mechanical window the router missed).
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

  // When many photos arrive at once each upload races to create the shift. The
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
    // parallel uploads writing the same row. A transaction-scoped
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
            // Snapshot the opening the first time this reading is assembled: the
            // latest duyệt'd closing of this trụ from an earlier ngày, else the trụ's
            // cache (lib/shifts/opening-reading.ts). A re-ingested photo (or an
            // opening the accountant has already entered) keeps the value it has;
            // only a slot still empty is filled.
            const opening =
              existing?.openingElectronicReading != null &&
              existing?.openingMechanicalReading != null
                ? null
                : await openingReadingsFor(
                    dispenser.id,
                    (
                      await tx.shift.findUniqueOrThrow({
                        where: { id: shift.id },
                        select: { shiftDate: true },
                      })
                    ).shiftDate,
                    tx
                  )
            const openElec = num(existing?.openingElectronicReading) ?? opening?.electronic ?? null
            const openMech = num(existing?.openingMechanicalReading) ?? opening?.mechanical ?? null

            // Where the decimal point of an electronic read goes: the digits are the
            // AI's, only the dot moves, and only where arithmetic confirms it — the
            // mechanical meter's delta first, else the opening (resolveReadingScale).
            // Resolved before the duplicate check so the new read meets the prior one
            // on the same scale.
            const rawReading = parseNumericString(result.reading)
            const priorMech = num(existing?.mechanicalReading)
            const scale =
              slot === 'electronic'
                ? resolveReadingScale(
                    result.reading,
                    {
                      opening: openElec,
                      mechanicalDelta:
                        priorMech !== null && openMech !== null ? priorMech - openMech : null,
                    },
                    DEFAULT_ANOMALY_CONFIG.maxDeltaLiters,
                    DEFAULT_ANOMALY_CONFIG.meterDivergenceTolerance
                  )
                : null
            const reading = scale ? scale.value : rawReading
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

            const mechReading =
              slot === 'mechanical' ? resolved.value : num(existing?.mechanicalReading)

            // The mechanical photo landed after the electronic one: its delta is the
            // arithmetic the electronic dot could not be checked against before, so the
            // electronic read is placed again from its own raw digits. Never after a
            // reviewer has touched the row — their number is not the AI's to move.
            let replacedElec: ScaleResolution | null = null
            if (
              slot === 'mechanical' &&
              existing?.electronicPhotoId &&
              existing.reviewedBy == null &&
              mechReading !== null &&
              openMech !== null
            ) {
              const elecPhoto = await tx.shiftPhoto.findUnique({
                where: { id: existing.electronicPhotoId },
                select: { aiRawResponse: true },
              })
              const rawElec = (
                elecPhoto?.aiRawResponse as { extraction?: { reading?: string | null } } | null
              )?.extraction?.reading
              if (rawElec) {
                replacedElec = resolveReadingScale(
                  rawElec,
                  { opening: openElec, mechanicalDelta: mechReading - openMech },
                  DEFAULT_ANOMALY_CONFIG.maxDeltaLiters,
                  DEFAULT_ANOMALY_CONFIG.meterDivergenceTolerance
                )
              }
            }

            const elecReading =
              slot === 'electronic'
                ? resolved.value
                : (replacedElec?.value ?? num(existing?.electronicReading))
            const elecConf =
              slot === 'electronic' ? resolved.conf : (existing?.aiElectronicConfidence ?? null)
            const mechConf =
              slot === 'mechanical' ? resolved.conf : (existing?.aiMechanicalConfidence ?? null)
            const elecPhoto =
              slot === 'electronic' ? resolved.photoId : (existing?.electronicPhotoId ?? null)
            const mechPhoto =
              slot === 'mechanical' ? resolved.photoId : (existing?.mechanicalPhotoId ?? null)

            const derived = deriveReviewState(
              {
                electronicReading: elecReading,
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
            // Neither a diverging duplicate nor a guessed decimal point can
            // auto-approve: the accountant must look at the photo first. The rescale
            // flag belongs to the electronic photo holding the slot, so it survives
            // the mechanical photo re-assembling the row.
            const rescaled =
              scale && resolved.photoId === photoId
                ? scale.rescaled
                : replacedElec
                  ? replacedElec.rescaled
                  : (existing?.anomalyReasons ?? []).includes(ANOMALY_REASONS.scaleRescaled)
            const extraReasons = [
              ...(resolved.mismatch ? [ANOMALY_REASONS.duplicatePhotoMismatch] : []),
              ...(rescaled ? [ANOMALY_REASONS.scaleRescaled] : []),
            ]
            const review = extraReasons.length
              ? {
                  isAnomaly: true,
                  anomalyReasons: [...derived.anomalyReasons, ...extraReasons],
                  reviewStatus: 'needs_review',
                }
              : derived

            const data = {
              openingElectronicReading: openElec,
              openingMechanicalReading: openMech,
              electronicReading: elecReading,
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
                (slot === 'electronic' ? rawReading : null),
              originalMechanicalReading:
                num(existing?.originalMechanicalReading) ??
                (slot === 'mechanical' ? rawReading : null),
            }

            return tx.shiftReading.upsert({
              where: { shiftId_dispenserId: { shiftId: shift.id, dispenserId: dispenser.id } },
              // The nhiên liệu is stamped once, at creation: this ca sold what the
              // trụ pumps today, and keeps saying so if the trụ is later converted.
              create: {
                shiftId: shift.id,
                dispenserId: dispenser.id,
                fuelType: dispenser.fuelType,
                ...data,
              },
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

/** The weakest of the two numbers the charge is actually computed from. */
function debtConfidence(meter: ExtractVisitResult): number | null {
  const confs = [meter.litersConfidence, meter.unitPriceConfidence].filter(
    (c): c is number => c != null
  )
  return confs.length ? Math.min(...confs) : null
}

// Plausibility bounds for a single credit fill. Anything outside is a misread
// (a 15 đ URE price, a 2,619 L "fill"), not a real sale — flag, never post.
const LITERS_MAX = 2000
const UNIT_PRICE_MIN = 1000
const UNIT_PRICE_MAX = 100000

/**
 * Debt review status from the weakest of liters/unit-price confidence, the §5.6
 * amount check, and the plausibility anomalies collected by the caller (bounds,
 * retail-price cross-check, unresolved liters scale).
 */
function debtReview(
  meter: ExtractVisitResult,
  extraAnomalies: string[] = []
): { reviewStatus: string; anomalies: string[] } {
  const anomalies: string[] = [...extraAnomalies]
  if (meter.amountMatchesDisplay === false) anomalies.push('amount_mismatch')
  const conf = debtConfidence(meter)
  if (anomalies.length || conf == null) return { reviewStatus: 'needs_review', anomalies }
  // A debt visit always needs a human to assign the customer + approve (that is what
  // posts the charge), so never auto-approve — a confident read still waits in the
  // queue as 'pending', a weak one as 'needs_review'.
  const reviewStatus = classifyDebt(conf) === 'needs_review' ? 'needs_review' : 'pending'
  return { reviewStatus, anomalies }
}

/** Màn hình trụ half: liters, đơn giá, thành tiền and the guardrails, as visit columns. */
async function readDebtMeter(photoId: string, buffer: Buffer, stationId: string, visitDate: Date) {
  const meter = await extractVisitMeter({ imageBuffer: buffer })
  await prisma.shiftPhoto.update({
    where: { id: photoId },
    data: {
      aiProcessedAt: new Date(),
      meterType: meter.meterType,
      aiConfidence: debtConfidence(meter),
      aiRawResponse: meter.raw as Prisma.InputJsonValue,
    },
  })
  // Prefer the fuel word read off the printed pump label ("TRỤ 1 – DO"): it is the
  // ground truth and, unlike a price, is unaffected by contract/debt pricing. A mã
  // hàng belongs to the pair (trạm, nhiên liệu), read against the chosen trạm. Fall
  // back to inferring from the pump price via the station's fuel area retail prices,
  // and finally to null (the accountant sets it in review).
  const labelFuel = await resolveStationPlateFuel(stationId, meter.fuelType)
  // Retail prices are keyed by the station's fuel area (retail zone), not by station.
  const unitPriceRead = parseNumericString(meter.unitPrice)
  const litersRead = meter.litersResolved
  const prices = await loadStationPrices(stationId)
  const priceFuel =
    unitPriceRead !== null ? inferFuelTypeFromPrice(unitPriceRead, prices, visitDate) : null
  // Guardrails the AI numbers must pass before they can sit quietly in the
  // queue: physical bounds, an unresolved liters decimal, and the pump price
  // matching the bảng giá of the station's fuel area. The read price stands
  // either way — any hit forces needs_review, and the reviewer sees exactly why
  // on the card, next to the bảng giá price, and decides in Sửa số.
  const guardAnomalies: string[] = []
  if (litersRead != null && (litersRead <= 0 || litersRead > LITERS_MAX)) {
    guardAnomalies.push('liters_implausible')
  }
  if (litersRead != null && meter.litersResolution === 'unverified') {
    guardAnomalies.push('liters_unverified')
  }
  if (litersRead != null && meter.litersResolution === 'rescaled') {
    guardAnomalies.push('liters_rescaled')
  }
  if (unitPriceRead != null && (unitPriceRead < UNIT_PRICE_MIN || unitPriceRead > UNIT_PRICE_MAX)) {
    guardAnomalies.push('price_implausible')
  } else if (priceMismatchOf(prices, labelFuel ?? priceFuel, visitDate, unitPriceRead)) {
    guardAnomalies.push('price_mismatch')
  }
  const { reviewStatus, anomalies } = debtReview(meter, guardAnomalies)
  return {
    litersRead,
    unitPriceRead,
    fuelType: labelFuel ?? priceFuel,
    displayedAmount: parseNumericString(meter.displayedAmount),
    computedAmount: meter.computedAmount,
    amountMatchesDisplay: meter.amountMatchesDisplay,
    aiConfidence: debtConfidence(meter),
    aiRawResponse: meter.raw as Prisma.InputJsonValue,
    anomalyReasons: anomalies,
    reviewStatus,
  }
}

/** Xe half: the plate, matched against the trạm's known customer plates. */
async function readDebtVehicle(photoId: string, buffer: Buffer, stationId: string) {
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
      where: { stationId, isActive: true },
      select: { id: true, knownPlates: true },
    })
    customer = candidates.find((c) => plateListContains(c.knownPlates, plate.plate)) ?? null
  }
  return { plateRead: plate.plate, customerId: customer?.id ?? null }
}

/**
 * One lượt xe công nợ from the photos the uploader handed in together: the màn hình
 * trụ, plus the xe unless it was a walk-in/can sale. Nothing here guesses which photos
 * belong together, so the fill is written once. A half the AI cannot read still joins
 * the visit — its photo is there for the reviewer, its numbers left for Sửa số.
 */
export async function assembleDebtVisit(params: {
  station: { id: string }
  timestamp: number
  meter: { photoId: string; buffer: Buffer }
  vehicle: { photoId: string; buffer: Buffer } | null
  note: string | null
}): Promise<{ visitId: string }> {
  const { station, meter, vehicle, note } = params
  const visitDate = new Date(params.timestamp)
  const [meterRead, vehicleRead] = await Promise.allSettled([
    readDebtMeter(meter.photoId, meter.buffer, station.id, visitDate),
    vehicle ? readDebtVehicle(vehicle.photoId, vehicle.buffer, station.id) : null,
  ])
  if (meterRead.status === 'rejected') {
    logger.error({ error: meterRead.reason, photoId: meter.photoId }, 'Debt meter read failed')
  }
  if (vehicleRead.status === 'rejected') {
    logger.error({ error: vehicleRead.reason, photoId: vehicle?.photoId }, 'Debt plate read failed')
  }
  const visit = await prisma.debtVehicleVisit.create({
    data: {
      stationId: station.id,
      visitDate,
      senderNote: note,
      meterPhotoId: meter.photoId,
      vehiclePhotoId: vehicle?.photoId ?? null,
      reviewStatus: 'needs_review',
      ...(vehicleRead.status === 'fulfilled' && vehicleRead.value ? vehicleRead.value : {}),
      ...(meterRead.status === 'fulfilled' ? meterRead.value : {}),
    },
  })
  // Both photos now sit in a lượt xe, so neither waits in the ca's unmatched list.
  await prisma.shiftPhoto.updateMany({
    where: { id: { in: [meter.photoId, ...(vehicle ? [vehicle.photoId] : [])] } },
    data: { matchStatus: 'matched' },
  })
  return { visitId: visit.id }
}

/** Reads a đo hầm photo and appends a per-hầm dip history record. */
export async function ingestTankDip(
  photoId: string,
  buffer: Buffer,
  // A result already extracted upstream (station identification) — reused here.
  precomputed?: ExtractTankDipResult,
  station?: { id: string } | null
): Promise<ExtractTankDipResult> {
  const result = precomputed ?? (await extractTankDip({ imageBuffer: buffer }))
  // The printed tank label names its station ("TANHOA / HẦM 3 / E0 - 6K") — the
  // most trustworthy source there is, exactly like the pump plate for shift and
  // debt photos. It overrides the sender/context station, so forwarded dips
  // never poison another trạm's delta chain.
  let target = station ?? null
  if (result.stationLabel) {
    const byLabel = await matchStationByLabel(result.stationLabel)
    if (byLabel) {
      if (target && byLabel.id !== target.id) {
        logger.info(
          { from: target.id, to: byLabel.code, label: result.stationLabel },
          'Tank dip station label overrides sender station'
        )
      }
      target = { id: byLabel.id }
    } else if (target) {
      logger.warn(
        { stationId: target.id, label: result.stationLabel },
        'Tank dip label matches no station — keeping sender station'
      )
    }
  }
  const tankNumber = result.tankNumber ?? result.tankLabel?.match(/(\d+)/)?.[1] ?? null
  const tankCode = target && tankNumber ? tankCodeFor(Number.parseInt(tankNumber, 10)) : null
  // The dip counts at its photo's instant — for a tải bù ngày that is before dips
  // already on file — so its neighbours are found around that instant, not at the
  // end of the chain. A rejected dip cannot be a neighbour for "So với lần trước".
  // Existing rows at the same instant were created earlier, so they come before it:
  // the createdAt tie-break correction uses (lib/inventory/apply-dip-correction.ts).
  const sent = await prisma.shiftPhoto.findUniqueOrThrow({
    where: { id: photoId },
    select: { receivedAt: true, createdAt: true },
  })
  const measuredAt = sent.receivedAt ?? sent.createdAt
  const [configuredTank, attached, previous, next] =
    target && tankCode
      ? await Promise.all([
          prisma.tank.findUnique({
            where: { stationId_code: { stationId: target.id, code: tankCode } },
            select: { fuelType: true },
          }),
          prisma.dispenser.findMany({
            where: {
              stationId: target.id,
              isActive: true,
              tankLinks: { some: { tank: { code: tankCode } } },
            },
            include: withTanks,
          }),
          prisma.tankDipRecord.findFirst({
            where: { ...countableDipWhere(target.id), tankCode, measuredAt: { lte: measuredAt } },
            orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
          }),
          prisma.tankDipRecord.findFirst({
            where: { ...countableDipWhere(target.id), tankCode, measuredAt: { gt: measuredAt } },
            orderBy: [{ measuredAt: 'asc' }, { createdAt: 'asc' }],
          }),
        ])
      : [null, [], null, null]
  // Cấu hình's hầm is authoritative even when the plate word is misread as a
  // different known fuel. Otherwise the plate, linked trụ, then older dip answer.
  const plateFuel = target ? await resolveStationPlateFuel(target.id, result.fuelType) : null
  const fuelType =
    configuredTank?.fuelType ??
    plateFuel ??
    (tankCode ? tankFuelFrom(attached, tankCode) : null) ??
    previous?.fuelType ??
    null
  if (!plateFuel && fuelType) {
    logger.info(
      { photoId, tankCode, word: result.fuelType, fuelType },
      'Tank dip fuel word unresolved — filled from the hầm'
    )
  }
  await prisma.shiftPhoto.update({
    where: { id: photoId },
    data: {
      aiProcessedAt: new Date(),
      meterType: 'tank_dip',
      aiConfidence: result.confidence,
      extractedFuelType: fuelType,
      aiRawResponse: result.raw as Prisma.InputJsonValue,
    },
  })

  // Dip overlays/handwriting use Vietnamese separators: "1.000" is one
  // thousand millimetres, not 1.0 — parseNumericString (built for debt
  // displays like "46.81") would read it a thousand times too small.
  const dip = parseVnNumber(result.dipValue)
  if (!target || !tankCode || dip === null) return result

  // Inserting between two dips re-derives the later one's "So với lần trước" too.
  const reduce = (row: typeof previous) =>
    row ? { id: row.id, dipValue: Number(row.dipValue) } : null
  const side = { previous: reduce(previous), next: reduce(next) }
  const plan = planDipRewire({ self: { dipValue: dip }, from: side, to: side, movedTank: false })

  await prisma.$transaction([
    prisma.tankDipRecord.create({
      data: {
        stationId: target.id,
        tankCode,
        fuelType,
        capacityK: result.capacityK,
        dipValue: dip,
        ...plan.self,
        // Every đo hầm waits for a người duyệt, whatever the AI's confidence —
        // stated here rather than left to the column default so the write site reads
        // the same as the rule.
        reviewStatus: 'pending',
        photoId,
        measuredAt,
      },
    }),
    ...plan.neighbours.map(({ id, ...comparison }) =>
      prisma.tankDipRecord.update({ where: { id }, data: comparison })
    ),
  ])
  return result
}
