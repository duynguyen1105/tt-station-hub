import { randomUUID } from 'node:crypto'

import { classifyPhoto, extractMeter } from '@/lib/ai/extract-meter'
import type { RouterResult } from '@/lib/ai/types'
import { dayKeyOf } from '@/lib/debts/ledger'
import { readInstantBound } from '@/lib/filters/params'
import { logger } from '@/lib/logger'
import { matchStationByLabel } from '@/lib/matching/station-label'
import {
  type DebtPhotoType,
  assembleDebtVisit,
  findOrCreateShift,
  ingestTankDip,
  runShiftExtraction,
  shiftDateFor,
} from '@/lib/photos/ingest'
import { unmatchedTrace } from '@/lib/photos/unmatched-photos'
import { prisma } from '@/lib/prisma'
import { uploadPhoto } from '@/lib/storage/photo-storage'

export const UPLOAD_KINDS = ['shift', 'debt', 'dip'] as const
export type UploadKind = (typeof UPLOAD_KINDS)[number]

/** How many photos one item of each section carries: công nợ is a pair, or one walk-in photo. */
export const PHOTO_COUNTS: Record<UploadKind, readonly number[]> = {
  shift: [1],
  debt: [1, 2],
  dip: [1],
}

/**
 * The instant an upload counts for: today is now; an earlier ngày (tải bù) is its
 * last millisecond in Vietnam. Null for a future or impossible ngày.
 */
export function uploadTimestamp(day: string, now: number): number | null {
  const today = dayKeyOf(shiftDateFor(now))
  if (day === today) return now
  const end = readInstantBound(day, 'end')
  return end && day < today ? end.getTime() : null
}

function halfOf(type: RouterResult['image_type'] | null | undefined): DebtPhotoType | null {
  if (type === 'vehicle') return 'vehicle'
  // Inside a công nợ pair a totalizer look-alike is the pump half: the section said "debt".
  if (type === 'debt_meter' || type === 'electronic_meter' || type === 'mechanical_meter') {
    return 'debt_meter'
  }
  return null
}

/**
 * Which photo of a công nợ pair is the xe and which the màn hình trụ. Whichever the
 * router is sure of decides; when it is sure of neither, or calls both the same, the
 * upload order does — xe first.
 */
export function pairHalves(
  a: RouterResult['image_type'] | null | undefined,
  b: RouterResult['image_type'] | null | undefined
): [DebtPhotoType, DebtPhotoType] {
  const [ha, hb] = [halfOf(a), halfOf(b)]
  return ha !== hb && (ha === 'debt_meter' || hb === 'vehicle')
    ? ['debt_meter', 'vehicle']
    : ['vehicle', 'debt_meter']
}

export type UploadItem = {
  kind: UploadKind
  station: { id: string; code: string }
  timestamp: number
  senderName: string
  note: string | null
  /** One photo, or a công nợ pair (PHOTO_COUNTS). */
  buffers: [Buffer] | [Buffer, Buffer]
}

async function savePhoto(
  item: UploadItem,
  stationCode: string,
  folder: 'shift' | 'debt' | 'inventory',
  buffer: Buffer,
  shiftId: string | null
) {
  const path = `${stationCode}/${folder}/${randomUUID()}.jpg`
  await uploadPhoto(path, buffer)
  return prisma.shiftPhoto.create({
    data: {
      shiftId,
      source: 'web_upload',
      senderName: item.senderName,
      senderNote: item.note,
      receivedAt: new Date(item.timestamp),
      storageUrl: path,
      storagePath: path,
      fileSizeBytes: buffer.byteLength,
      matchStatus: 'unmatched',
    },
  })
}

/** A failed AI pass leaves its trace on the photo, so it still shows in the ca's unmatched list. */
function traceFailure(photoId: string, what: string) {
  return async (error: unknown) => {
    logger.error({ error, photoId }, `${what} failed`)
    await prisma.shiftPhoto
      .update({
        where: { id: photoId },
        data: unmatchedTrace('extraction_failed', { router: null, error }),
      })
      .catch(() => {})
  }
}

/** A chốt'd ca takes no ảnh chốt ca — also when the printed label moved the photo onto one. */
export class ShiftClosedError extends Error {}

/** Stores one item and runs it through its section's reader. Returns the new photo ids. */
export async function ingestUpload(item: UploadItem): Promise<string[]> {
  const { station, timestamp } = item
  const [buffer, second] = item.buffers

  if (item.kind === 'shift') {
    const extracted = await extractMeter({ imageBuffer: buffer }).catch(() => undefined)
    // The pump's printed trạm label beats the chosen trạm: another trạm's trụ never
    // becomes this trạm's reading.
    let target = station
    if (extracted?.stationLabel) {
      const byLabel = await matchStationByLabel(extracted.stationLabel)
      if (byLabel) {
        if (byLabel.id !== station.id) {
          logger.info(
            { from: station.code, to: byLabel.code, label: extracted.stationLabel },
            'Photo station label overrides the chosen station'
          )
        }
        target = byLabel
      }
    }
    const shift = await findOrCreateShift(target.id, timestamp)
    if (shift.status === 'completed') throw new ShiftClosedError()
    const photo = await savePhoto(item, target.code, 'shift', buffer, shift.id)
    await runShiftExtraction(
      photo.id,
      buffer,
      { id: shift.id, stationId: target.id },
      undefined,
      undefined,
      extracted
    ).catch(traceFailure(photo.id, 'Shift extraction'))
    return [photo.id]
  }

  if (item.kind === 'debt') {
    let meterBuffer = buffer
    let vehicleBuffer: Buffer | null = null
    if (second) {
      const [ra, rb] = await Promise.all(
        [buffer, second].map((b) => classifyPhoto(b).catch(() => null))
      )
      const [firstHalf] = pairHalves(ra?.image_type, rb?.image_type)
      ;[vehicleBuffer, meterBuffer] = firstHalf === 'vehicle' ? [buffer, second] : [second, buffer]
    }
    // The day's first công nợ opens its ca, like the first ảnh trụ does.
    const shift = await findOrCreateShift(station.id, timestamp)
    const meter = await savePhoto(item, station.code, 'debt', meterBuffer, shift.id)
    const vehicle = vehicleBuffer
      ? await savePhoto(item, station.code, 'debt', vehicleBuffer, shift.id)
      : null
    await assembleDebtVisit({
      station,
      timestamp,
      note: item.note,
      meter: { photoId: meter.id, buffer: meterBuffer },
      vehicle: vehicle && vehicleBuffer ? { photoId: vehicle.id, buffer: vehicleBuffer } : null,
    })
    return vehicle ? [vehicle.id, meter.id] : [meter.id]
  }

  const photo = await savePhoto(item, station.code, 'inventory', buffer, null)
  await ingestTankDip(photo.id, buffer, undefined, station).catch(
    traceFailure(photo.id, 'Tank-dip ingest')
  )
  return [photo.id]
}
