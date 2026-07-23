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
import { Prisma, Vung } from '@/lib/generated/prisma/client'
import { logger } from '@/lib/logger'
import { DEFAULT_ANOMALY_CONFIG } from '@/lib/matching/anomaly-detection'
import { type MeterSlot, matchPhotoToDispenser } from '@/lib/matching/photo-to-reading'
import { deriveReviewState } from '@/lib/matching/review-state'
import { matchStationByLabel } from '@/lib/matching/station-label'
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

// Shift windows by Vietnam (GMT+7) hour. TODO(§12.5): confirm real ca times.
function vietnamParts(timestamp: number) {
  const shifted = new Date(timestamp + 7 * 60 * 60 * 1000)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
  }
}

export function shiftDateFor(timestamp: number): Date {
  const p = vietnamParts(timestamp)
  return new Date(Date.UTC(p.year, p.month, p.day))
}

export function shiftTypeFor(timestamp: number): 'morning' | 'afternoon' | 'night' {
  const { hour } = vietnamParts(timestamp)
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'night'
}

/** Finds the open shift for a station+window, or creates a fresh one. */
export async function findOrCreateShift(stationId: string, timestamp: number) {
  const shiftDate = shiftDateFor(timestamp)
  const shiftType = shiftTypeFor(timestamp)
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
  const dispenserId =
    override?.dispenserId ?? (match.status === 'matched' ? match.dispenserId : null)
  const slot = override?.slot ?? match.slot
  const matchStatus = override?.dispenserId ? 'matched' : match.status
  await prisma.shiftPhoto.update({ where: { id: photoId }, data: { matchStatus } })

  const dispenser = dispenserId ? dispensers.find((d) => d.id === dispenserId) : undefined

  if (dispenser && slot) {
    // Read-compute-upsert must be atomic: with many photos arriving at once, the
    // electronic and mechanical photo of the SAME dispenser can be processed by two
    // parallel webhook invocations — a plain read-then-upsert loses one slot (the
    // later write overwrites from a stale snapshot). Serializable + retry makes the
    // loser re-read the winner's slot instead of clobbering it.
    let row: { id: string } | undefined
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        row = await prisma.$transaction(
          async (tx) => {
            const existing = await tx.shiftReading.findUnique({
              where: { shiftId_dispenserId: { shiftId: shift.id, dispenserId: dispenser.id } },
            })
            const reading = parseNumericString(result.reading)
            const conf = result.readingConfidence

            const elecReading = slot === 'electronic' ? reading : num(existing?.electronicReading)
            const mechReading = slot === 'mechanical' ? reading : num(existing?.mechanicalReading)
            const elecConf =
              slot === 'electronic' ? conf : (existing?.aiElectronicConfidence ?? null)
            const mechConf =
              slot === 'mechanical' ? conf : (existing?.aiMechanicalConfidence ?? null)
            const elecPhoto =
              slot === 'electronic' ? photoId : (existing?.electronicPhotoId ?? null)
            const mechPhoto =
              slot === 'mechanical' ? photoId : (existing?.mechanicalPhotoId ?? null)

            // Snapshot the opening from the dispenser's last-reading cache the first
            // time this reading is assembled; a re-ingested photo (or an opening the
            // accountant has already entered) keeps the value it already has.
            const openElec =
              num(existing?.openingElectronicReading) ?? num(dispenser.lastElectronicReading)
            const openMech =
              num(existing?.openingMechanicalReading) ?? num(dispenser.lastMechanicalReading)

            const review = deriveReviewState(
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
          { isolationLevel: 'Serializable' }
        )
        break
      } catch (error) {
        // P2034 = serialization conflict, P2002 = concurrent create — retry fresh.
        const code = (error as { code?: string }).code
        if ((code === 'P2034' || code === 'P2002') && attempt < 3) continue
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

const DEBT_PAIR_WINDOW_MS = 5 * 60 * 1000

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
 * Per-trip debt counterpart to assembleShiftReading: reads the photo (meter ->
 * liters + unit price + computed amount; or vehicle -> plate), then upserts a
 * `debt_vehicle_visit`, pairing a meter photo with a recent vehicle photo (or
 * vice-versa) at the same station within a 5-min window (build plan §4.2). A
 * vehicle plate is cross-checked against known customer plates to auto-assign.
 */
export async function assembleDebtVisit(params: {
  photoId: string
  station: { id: string }
  timestamp: number
  type: DebtPhotoType
  buffer: Buffer
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
  const { photoId, station, timestamp, type, buffer } = params
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
    // back to inferring from the pump price via the station's Vùng retail prices, and
    // finally to null (the accountant sets it in review).
    const labelFuel = normalizeFuelType(meter.fuelType)
    // The pump plate often names the STATION too ("ĐAKNONG 1 / TRỤ 1 – DO") — let it
    // override the sender's station, mirroring shift photos. The reviewer can still
    // change the station manually on the review card.
    let target = station
    if (meter.stationLabel) {
      const byLabel = await matchStationByLabel(meter.stationLabel)
      if (byLabel && byLabel.id !== station.id) {
        logger.info(
          { from: station.id, to: byLabel.code, label: meter.stationLabel },
          'Debt visit station label overrides sender station'
        )
        target = { id: byLabel.id }
      }
    }
    // Retail prices are keyed by the station's Vùng (retail zone), not by station.
    const stationRow = await prisma.station.findUnique({
      where: { id: target.id },
      select: { vung: true },
    })
    const priceRows = await prisma.misaRetailPrice.findMany({
      where: { vung: stationRow?.vung ?? Vung.VUNG_1 },
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
    // Pair with a recent vehicle-only visit at this station, else open a new one.
    const open = await prisma.debtVehicleVisit.findFirst({
      where: {
        stationId: target.id,
        meterPhotoId: null,
        vehiclePhotoId: { not: null },
        visitDate: { gte: windowStart },
      },
      orderBy: { visitDate: 'desc' },
    })
    const visit = open
      ? await prisma.debtVehicleVisit.update({ where: { id: open.id }, data: meterData })
      : await prisma.debtVehicleVisit.create({
          data: { stationId: target.id, visitDate, ...meterData },
        })
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
  const customer = plate.plate
    ? await prisma.debtCustomer.findFirst({
        where: { stationId: station.id, knownPlates: { has: plate.plate }, isActive: true },
        select: { id: true },
      })
    : null
  const open = await prisma.debtVehicleVisit.findFirst({
    where: {
      stationId: station.id,
      vehiclePhotoId: null,
      meterPhotoId: { not: null },
      visitDate: { gte: windowStart },
    },
    orderBy: { visitDate: 'desc' },
  })
  const visit = open
    ? await prisma.debtVehicleVisit.update({
        where: { id: open.id },
        data: {
          vehiclePhotoId: photoId,
          plateRead: plate.plate,
          customerId: open.customerId ?? customer?.id ?? null,
          ...(caption ? { zaloCaption: caption } : {}),
        },
      })
    : await prisma.debtVehicleVisit.create({
        data: {
          stationId: station.id,
          visitDate,
          vehiclePhotoId: photoId,
          plateRead: plate.plate,
          customerId: customer?.id ?? null,
          reviewStatus: 'needs_review',
          zaloCaption: caption,
        },
      })
  return { visitId: visit.id, meter: null, plate }
}

/** Reads a tank-dip (barem) photo and records it on the photo for inventory. */
export async function ingestTankDip(
  photoId: string,
  buffer: Buffer,
  // A result already extracted upstream (station identification) — reused here.
  precomputed?: ExtractTankDipResult
): Promise<ExtractTankDipResult> {
  const result = precomputed ?? (await extractTankDip({ imageBuffer: buffer }))
  await prisma.shiftPhoto.update({
    where: { id: photoId },
    data: {
      aiProcessedAt: new Date(),
      meterType: 'tank_dip',
      aiConfidence: result.confidence,
      extractedFuelType: result.fuelType,
      aiRawResponse: result.raw as Prisma.InputJsonValue,
    },
  })
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
      tank_result = await ingestTankDip(photo.id, params.buffer)
    } else {
      const visit = await assembleDebtVisit({
        photoId: photo.id,
        station: { id: params.station.id },
        timestamp: Date.now(),
        type: params.debtType ?? 'debt_meter',
        buffer: params.buffer,
        caption: params.caption,
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
