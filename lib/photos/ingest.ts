import { classifyDebt } from '@/lib/ai/confidence'
import { extractMeter } from '@/lib/ai/extract-meter'
import { extractTankDip } from '@/lib/ai/extract-tank-dip'
import {
  extractPlate,
  extractVisitMeter,
  parseNumericString,
  placeLitersDecimal,
} from '@/lib/ai/extract-visit'
import {
  type ExtractMeterResult,
  type ExtractPlateResult,
  type ExtractTankDipResult,
  type ExtractVisitResult,
  type RouterResult,
} from '@/lib/ai/types'
import { DEFAULT_LITERS_DECIMALS } from '@/lib/debts/liters-decimals'
import { plateListContains } from '@/lib/debts/plate'
import { tankCodeFor } from '@/lib/dispensers/naming'
import { resolveStationPlateFuel } from '@/lib/fuels/load-catalogue'
import { FuelArea, Prisma } from '@/lib/generated/prisma/client'
import { parseVnNumber } from '@/lib/imports/bien-ban'
import { countableDipWhere } from '@/lib/inventory/dip-review'
import { compareDipToPrevious } from '@/lib/inventory/tank-dip-rule'
import { tankFuelFrom } from '@/lib/inventory/tank-fuel'
import { logger } from '@/lib/logger'
import { ANOMALY_REASONS, DEFAULT_ANOMALY_CONFIG } from '@/lib/matching/anomaly-detection'
import {
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
import { getOrCreateUnknownStation, matchStationByLabel } from '@/lib/matching/station-label'
import { DEBT_PAIR_WINDOW_MS } from '@/lib/matching/visit-pairing'
import { type PhotoStationSource, resolveVisitStation } from '@/lib/matching/visit-station'
import { inferFuelTypeFromPrice, priceRowOnDate } from '@/lib/misa-export/build-sales-voucher'
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

            // Where the decimal point of an electronic read goes: the display's
            // configured decimals, else inferred from the opening (see
            // resolveReadingScale). Resolved before the duplicate check so the new
            // read meets the prior one on the same scale.
            const rawReading = parseNumericString(result.reading)
            const scale =
              slot === 'electronic'
                ? resolveReadingScale(
                    result.reading,
                    openElec,
                    DEFAULT_ANOMALY_CONFIG.maxDeltaLiters,
                    dispenser.electronicDecimals
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
export async function findOpenHalf(
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
  // True when the sender declared the station for this message (its caption or
  // their still-fresh typed context). A human statement beats the pump's printed
  // plate — the plate wins only when nothing was declared.
  stationDeclared: boolean
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
  const { photoId, station, stationDeclared, timestamp, type, buffer, submittedBy } = params
  const caption = params.caption?.trim() || null
  const visitDate = new Date(timestamp)
  const windowStart = new Date(timestamp - DEBT_PAIR_WINDOW_MS)

  if (type === 'debt_meter') {
    const read = params.precomputedMeter ?? (await extractVisitMeter({ imageBuffer: buffer }))
    await prisma.shiftPhoto.update({
      where: { id: photoId },
      data: {
        aiProcessedAt: new Date(),
        meterType: read.meterType,
        aiConfidence: debtConfidence(read),
        aiRawResponse: read.raw as Prisma.InputJsonValue,
      },
    })
    // The pump plate often names the STATION too ("ĐAKNONG 1 / TRỤ 1 – DO") — let it
    // override the sender's station, mirroring shift photos, unless the sender
    // declared the station for this message: "công nợ daknong1" is a statement
    // about THIS fill, while the plate is a read that can land on the wrong trạm
    // (a tank plate "DAKNONG5 HẦM 1" in the frame). The reviewer can still change
    // the station manually on the review card.
    let target = station
    let source: PhotoStationSource = stationDeclared ? 'declared' : 'inherited'
    if (read.stationLabel) {
      const byLabel = await matchStationByLabel(read.stationLabel)
      if (byLabel && stationDeclared) {
        if (byLabel.id !== station.id) {
          logger.warn(
            { declared: station.id, label: byLabel.code },
            'Debt visit pump plate disagrees with the declared station — declaration wins'
          )
        }
      } else if (byLabel) {
        source = 'pump_plate'
        if (byLabel.id !== station.id) {
          logger.info(
            { from: station.id, to: byLabel.code, label: read.stationLabel },
            'Debt visit station label overrides sender station'
          )
        }
        target = { id: byLabel.id }
      }
    }
    // Prefer the fuel word read off the printed pump label ("TRỤ 1 – DO"): it is the
    // ground truth and, unlike a price, is unaffected by contract/debt pricing. It is
    // resolved HERE, below the station override, because a mã hàng belongs to the pair
    // (trạm, nhiên liệu) — reading it against the sender's trạm rather than the one the
    // plate just moved the photo to would look up the wrong trạm's mã hàng. Pairing can
    // still move the visit somewhere else again, which is what the second pass below the
    // transaction is for. Fall back to inferring from the pump price via the station's
    // fuel area retail prices, and finally to null (the accountant sets it in review).
    const labelFuel = await resolveStationPlateFuel(target.id, read.fuelType)
    // Retail prices are keyed by the station's fuel area (retail zone), not by
    // station; the LÍT decimal convention is the trạm's own.
    const stationRow = await prisma.station.findUnique({
      where: { id: target.id },
      select: { fuelArea: true, litersDecimals: true },
    })
    // The reader placed the decimal under the default convention before any trạm
    // was known — re-place it under the trạm the plate/sender settled on.
    const meter = placeLitersDecimal(read, stationRow?.litersDecimals ?? DEFAULT_LITERS_DECIMALS)
    const unitPriceRead = parseNumericString(meter.unitPrice)
    const litersRead = meter.litersResolved
    const priceRows = await prisma.misaRetailPrice.findMany({
      where: { fuelArea: stationRow?.fuelArea ?? FuelArea.FUEL_AREA_1 },
    })
    const prices = priceRows.map((p) => ({
      fuelType: p.fuelType,
      effectiveDate: p.effectiveDate,
      unitPrice: p.unitPrice.toNumber(),
    }))
    const priceFuel =
      unitPriceRead !== null ? inferFuelTypeFromPrice(unitPriceRead, prices, visitDate) : null
    // Guardrails the AI numbers must pass before they can sit quietly in the
    // queue: physical bounds, an unresolved liters decimal, and the pump price
    // matching SOME configured retail price of the station's fuel area. Any
    // hit forces needs_review — the reviewer sees exactly why on the card.
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
    if (
      unitPriceRead != null &&
      (unitPriceRead < UNIT_PRICE_MIN || unitPriceRead > UNIT_PRICE_MAX)
    ) {
      guardAnomalies.push('price_implausible')
    } else if (unitPriceRead != null && prices.length > 0) {
      const fuels = new Set(prices.map((p) => p.fuelType))
      const listed = [...fuels].some(
        (f) => priceRowOnDate(prices, f, visitDate)?.unitPrice === unitPriceRead
      )
      if (!listed) guardAnomalies.push('price_mismatch')
    }
    const { reviewStatus, anomalies } = debtReview(meter, guardAnomalies)
    const meterData = {
      litersRead,
      unitPriceRead,
      fuelType: labelFuel ?? priceFuel,
      displayedAmount: parseNumericString(meter.displayedAmount),
      computedAmount: meter.computedAmount,
      amountMatchesDisplay: meter.amountMatchesDisplay,
      meterPhotoId: photoId,
      aiConfidence: debtConfidence(meter),
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
                  photoStationSource: source,
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
    // The photo now sits in a lượt xe: it is no longer waiting to be placed, so it
    // leaves the ca's unmatched list (components/shifts/unmatched-photos.tsx).
    await prisma.shiftPhoto.update({ where: { id: photoId }, data: { matchStatus: 'matched' } })
    // The pairing lock has the last word on the trạm, and it can disagree with the one
    // the plate word was just read against: a photo from an unidentified sender arrives
    // parked on the UNKNOWN trạm, and a label-less one joining an existing visit leaves
    // that visit's trạm standing (resolveVisitStation). Either way the mã hàng consulted
    // above were the wrong trạm's, so ask the trạm the visit actually settled on. A word
    // that trạm cannot place falls back to the price like any unread plate.
    if (meter.fuelType && visit.stationId !== target.id) {
      const settledFuel =
        (await resolveStationPlateFuel(visit.stationId, meter.fuelType)) ?? priceFuel
      if (settledFuel !== visit.fuelType) {
        await prisma.debtVehicleVisit.update({
          where: { id: visit.id },
          data: { fuelType: settledFuel },
        })
      }
    }
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
              // A vehicle photo has no pump plate to read a station off: it carries
              // the sender's declaration when there is one, otherwise only an
              // inherited guess that never overwrites what the visit concluded.
              stationId: resolveVisitStation({
                visitStationId: open.stationId,
                photoStationId: station.id,
                photoStationSource: stationDeclared ? 'declared' : 'inherited',
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
  await prisma.shiftPhoto.update({ where: { id: photoId }, data: { matchStatus: 'matched' } })
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
  // The printed tank label names its station ("TANHOA / HẦM 3 / E0 - 6K") — the
  // most trustworthy source there is, exactly like the pump plate for shift and
  // debt photos. It overrides the sender/context station: a courier forwarding
  // several stations' dips through one Zalo thread must not file TANHOA's tank
  // under DAKNONG3 (and poison DAKNONG3's delta/reserve chain).
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
  // The trụ drawing on this hầm, and the last dip anyone still stands behind. The
  // trụ say whether the hầm is dự phòng and what it holds; the previous dip is what
  // this one is compared to. A read kế toán từ chối is skipped: comparing against it
  // would put a bogus "So với lần trước" on this row and could fire a false
  // reserve_stock_changed on a hầm that never moved.
  const [attached, previous] =
    target && tankCode
      ? await Promise.all([
          prisma.dispenser.findMany({
            where: { stationId: target.id, tankCode, isActive: true },
            select: { tankCode: true, fuelType: true },
          }),
          prisma.tankDipRecord.findFirst({
            where: { ...countableDipWhere(target.id), tankCode },
            // createdAt breaks a measuredAt tie — two shots of the same stick in one
            // Zalo burst share a timestamp — so this picks the same neighbour a later
            // correction of the row would (lib/inventory/apply-dip-correction.ts).
            orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
          }),
        ])
      : [[], null]
  // The prompt copies the fuel word off the hầm plate as printed, so it is only a khóa
  // once this trạm's mã hàng and the danh mục have had a look at it. Resolved against
  // the trạm the LABEL settled on (not the sender's), because a mã hàng belongs to the
  // pair (trạm, nhiên liệu). A plate this trạm cannot place — worn paint, a word the
  // AI misread — falls back to what the hầm is known to hold: the trụ drawing on it,
  // then the previous đo hầm of the same hầm (a hầm dự phòng has no trụ, but its earlier
  // dips were reviewed). Only a hầm nothing has ever said anything about lands with an
  // empty nhiên liệu, for kế toán to set. Each source is a fact about THIS hầm, never a
  // guess across hầm.
  const plateFuel = target ? await resolveStationPlateFuel(target.id, result.fuelType) : null
  const fuelType =
    plateFuel ?? (tankCode ? tankFuelFrom(attached, tankCode) : null) ?? previous?.fuelType ?? null
  if (!plateFuel && fuelType) {
    logger.info(
      { photoId, tankCode, word: result.fuelType, fuelType },
      'Tank dip fuel word unresolved — filled from the hầm'
    )
  }
  const photo = await prisma.shiftPhoto.update({
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

  const isReserve = attached.length === 0
  const comparison = compareDipToPrevious({
    dipValue: dip,
    previousDipValue: previous ? Number(previous.dipValue) : null,
    isReserve,
  })

  await prisma.tankDipRecord.create({
    data: {
      stationId: target.id,
      tankCode,
      fuelType,
      capacityK: result.capacityK,
      dipValue: dip,
      isReserve,
      ...comparison,
      // Every đo hầm waits for a người duyệt, whatever the AI's confidence —
      // stated here rather than left to the column default so the write site reads
      // the same as the rule.
      reviewStatus: 'pending',
      photoId,
      measuredAt: photo.zaloReceivedAt ?? photo.createdAt,
    },
  })
  if (comparison.isAnomaly) {
    logger.warn(
      {
        stationId: target.id,
        tankCode,
        dip,
        previous: previous?.dipValue?.toString(),
        delta: comparison.deltaFromPrevious,
      },
      'Reserve tank dip moved beyond tolerance'
    )
  }
  return result
}
