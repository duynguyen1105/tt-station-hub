import { randomUUID } from 'crypto'

import { type ConfidenceClass, classifyElectronic, classifyMechanical } from '@/lib/ai/confidence'
import { extractMeter } from '@/lib/ai/extract-meter'
import { extractVisitMeter, parseNumericString } from '@/lib/ai/extract-visit'
import { type ExtractMeterResult, type ExtractVisitResult } from '@/lib/ai/types'
import { Prisma } from '@/lib/generated/prisma/client'
import { logger } from '@/lib/logger'
import { DEFAULT_ANOMALY_CONFIG, detectAnomalies } from '@/lib/matching/anomaly-detection'
import { matchPhotoToDispenser } from '@/lib/matching/photo-to-reading'
import { prisma } from '@/lib/prisma'
import { uploadPhoto } from '@/lib/storage/photo-storage'
import { type ZaloMessageKind, classifyZaloMessage } from '@/lib/zalo/classify'

type ShiftRef = { id: string; stationId: string }

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
  const existing = await prisma.shift.findFirst({
    where: { stationId, shiftDate, shiftType, status: { notIn: ['completed', 'cancelled'] } },
  })
  if (existing) return existing
  return prisma.shift.create({
    data: { stationId, shiftDate, shiftType, status: 'collecting_photos' },
  })
}

const num = (value: unknown): number | null => (value == null ? null : Number(value))

const SEVERITY: Record<ConfidenceClass, number> = {
  auto_approved: 0,
  pending: 1,
  needs_review: 2,
}

/**
 * Matches an extracted shift photo to a dispenser meter, upserts the
 * `shift_readings` row (filling the electronic or mechanical slot), runs the
 * anomaly rules + confidence thresholds, links the photo, and advances the shift
 * out of `collecting_photos`. This is the build-plan §2.2 assembly step that turns
 * a stored+read photo into a reviewable reading.
 */
async function assembleShiftReading(
  photoId: string,
  shift: ShiftRef,
  result: ExtractMeterResult
): Promise<void> {
  const dispensers = await prisma.dispenser.findMany({
    where: { stationId: shift.stationId, isActive: true },
    orderBy: { displayOrder: 'asc' },
  })

  const match = matchPhotoToDispenser(
    { extractedDispenserCode: result.dispenserLabel, meterType: result.meterType },
    dispensers.map((d) => ({ id: d.id, code: d.code }))
  )
  await prisma.shiftPhoto.update({ where: { id: photoId }, data: { matchStatus: match.status } })

  const dispenser =
    match.status === 'matched' && match.slot
      ? dispensers.find((d) => d.id === match.dispenserId)
      : undefined

  if (dispenser && match.slot) {
    const existing = await prisma.shiftReading.findUnique({
      where: { shiftId_dispenserId: { shiftId: shift.id, dispenserId: dispenser.id } },
    })
    const reading = parseNumericString(result.reading)
    const conf = result.readingConfidence

    const elecReading = match.slot === 'electronic' ? reading : num(existing?.electronicReading)
    const mechReading = match.slot === 'mechanical' ? reading : num(existing?.mechanicalReading)
    const elecConf = match.slot === 'electronic' ? conf : (existing?.aiElectronicConfidence ?? null)
    const mechConf = match.slot === 'mechanical' ? conf : (existing?.aiMechanicalConfidence ?? null)
    const elecPhoto = match.slot === 'electronic' ? photoId : (existing?.electronicPhotoId ?? null)
    const mechPhoto = match.slot === 'mechanical' ? photoId : (existing?.mechanicalPhotoId ?? null)

    const anomaly = detectAnomalies(
      {
        electronicReading: elecReading,
        mechanicalReading: mechReading,
        lastElectronicReading: num(dispenser.lastElectronicReading),
        lastMechanicalReading: num(dispenser.lastMechanicalReading),
        electronicConfidence: elecConf,
        mechanicalConfidence: mechConf,
        hasElectronicMeter: dispenser.hasElectronicMeter,
        hasMechanicalMeter: dispenser.hasMechanicalMeter,
        hasElectronicPhoto: elecPhoto != null,
        hasMechanicalPhoto: mechPhoto != null,
      },
      DEFAULT_ANOMALY_CONFIG
    )

    const classes: ConfidenceClass[] = []
    if (elecReading != null && elecConf != null) classes.push(classifyElectronic(elecConf))
    if (mechReading != null && mechConf != null) classes.push(classifyMechanical(mechConf))
    // Most-severe confidence class across the filled slots; default to
    // needs_review when nothing could be classified.
    const worst = classes.length
      ? classes.reduce((a, b) => (SEVERITY[b] > SEVERITY[a] ? b : a))
      : 'needs_review'
    const reviewStatus = anomaly.isAnomaly ? 'needs_review' : worst

    const data = {
      electronicReading: elecReading,
      mechanicalReading: mechReading,
      electronicPhotoId: elecPhoto,
      mechanicalPhotoId: mechPhoto,
      aiElectronicConfidence: elecConf,
      aiMechanicalConfidence: mechConf,
      electronicDelta: anomaly.electronicDelta,
      mechanicalDelta: anomaly.mechanicalDelta,
      isAnomaly: anomaly.isAnomaly,
      anomalyReasons: anomaly.reasons,
      reviewStatus,
      // Preserve the first AI value so a later correction can show the original.
      originalElectronicReading:
        num(existing?.originalElectronicReading) ?? (match.slot === 'electronic' ? reading : null),
      originalMechanicalReading:
        num(existing?.originalMechanicalReading) ?? (match.slot === 'mechanical' ? reading : null),
    }

    const row = await prisma.shiftReading.upsert({
      where: { shiftId_dispenserId: { shiftId: shift.id, dispenserId: dispenser.id } },
      create: { shiftId: shift.id, dispenserId: dispenser.id, ...data },
      update: data,
    })
    await prisma.shiftPhoto.update({
      where: { id: photoId },
      data: { matchStatus: 'matched', matchedReadingId: row.id },
    })
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
  shift: ShiftRef
): Promise<ExtractMeterResult> {
  const result = await extractMeter({ imageBuffer: buffer })
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
  await assembleShiftReading(photoId, shift, result)
  return result
}

/** Runs the debt (per-trip) extraction and records it on the photo. */
async function runDebtExtraction(photoId: string, buffer: Buffer): Promise<ExtractVisitResult> {
  const result = await extractVisitMeter({ imageBuffer: buffer })
  await prisma.shiftPhoto.update({
    where: { id: photoId },
    data: {
      aiProcessedAt: new Date(),
      meterType: result.meterType,
      aiConfidence: result.amountConfidence,
      aiRawResponse: result.raw as Prisma.InputJsonValue,
    },
  })
  return result
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/webp': 'webp',
}

export type ManualIngestResult = {
  photoId: string
  kind: ZaloMessageKind
  storagePath: string
  shiftId: string | null
  shift: ExtractMeterResult | null
  debt: ExtractVisitResult | null
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
  kind?: ZaloMessageKind
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
  let extractionError: string | null = null
  try {
    if (kind === 'shift' && shift) {
      shift_result = await runShiftExtraction(photo.id, params.buffer, {
        id: shift.id,
        stationId: params.station.id,
      })
    } else {
      debt_result = await runDebtExtraction(photo.id, params.buffer)
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
    extractionError,
  }
}
