import { randomUUID } from 'crypto'

import { extractMeter } from '@/lib/ai/extract-meter'
import { extractVisitMeter } from '@/lib/ai/extract-visit'
import { type ExtractMeterResult, type ExtractVisitResult } from '@/lib/ai/types'
import { Prisma } from '@/lib/generated/prisma/client'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { uploadPhoto } from '@/lib/storage/photo-storage'
import { type ZaloMessageKind, classifyZaloMessage } from '@/lib/zalo/classify'

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

/** Runs the shift meter extraction, persists the AI draft on the photo, returns it. */
export async function runShiftExtraction(
  photoId: string,
  buffer: Buffer
): Promise<ExtractMeterResult> {
  const result = await extractMeter({ imageBuffer: buffer })
  await prisma.shiftPhoto.update({
    where: { id: photoId },
    data: {
      aiProcessedAt: new Date(),
      meterType: result.meterType,
      extractedReading: result.reading,
      extractedStationCode: result.stationLabel,
      extractedDispenserCode: result.dispenserLabel,
      extractedFuelType: result.fuelType,
      aiConfidence: result.readingConfidence,
      aiRawResponse: result.raw as Prisma.InputJsonValue,
    },
  })
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
    if (kind === 'shift') shift_result = await runShiftExtraction(photo.id, params.buffer)
    else debt_result = await runDebtExtraction(photo.id, params.buffer)
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
