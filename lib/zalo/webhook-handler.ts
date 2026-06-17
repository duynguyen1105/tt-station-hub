import { extractMeter } from '@/lib/ai/extract-meter'
import { Prisma } from '@/lib/generated/prisma/client'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { uploadPhoto } from '@/lib/storage/photo-storage'
import { classifyZaloMessage } from '@/lib/zalo/classify'
import { downloadZaloAttachment } from '@/lib/zalo/client'

export type ZaloImageMessage = {
  messageId: string
  senderId: string
  senderName: string | null
  groupId: string | null
  timestamp: number // epoch ms — TRUSTED receive time (never the watermark)
  caption: string | null
  imageUrls: string[]
}

type RawAttachment = { type?: string; payload?: { url?: string } }
type RawZaloEvent = {
  event_name?: string
  sender?: { id?: string }
  message?: { msg_id?: string; text?: string; attachments?: RawAttachment[] }
  timestamp?: string | number
  group_id?: string
}

/** Extracts an image message from a Zalo webhook payload, or null if none. */
export function parseZaloEvent(payload: unknown): ZaloImageMessage | null {
  if (typeof payload !== 'object' || payload === null) return null
  const event = payload as RawZaloEvent

  const imageUrls = (event.message?.attachments ?? [])
    .filter((a) => a.type === 'image' && typeof a.payload?.url === 'string')
    .map((a) => a.payload!.url as string)
  if (imageUrls.length === 0) return null

  const senderId = event.sender?.id
  const messageId = event.message?.msg_id
  if (!senderId || !messageId) return null

  const rawTs = typeof event.timestamp === 'string' ? Number(event.timestamp) : event.timestamp
  const timestamp = typeof rawTs === 'number' && Number.isFinite(rawTs) ? rawTs : Date.now()

  return {
    messageId,
    senderId,
    senderName: null,
    groupId: event.group_id ?? null,
    timestamp,
    caption: event.message?.text ?? null,
    imageUrls,
  }
}

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

function shiftDateFor(timestamp: number): Date {
  const p = vietnamParts(timestamp)
  return new Date(Date.UTC(p.year, p.month, p.day))
}

function shiftTypeFor(timestamp: number): 'morning' | 'afternoon' | 'night' {
  const { hour } = vietnamParts(timestamp)
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'night'
}

async function findStationForMessage(msg: ZaloImageMessage) {
  if (msg.groupId) {
    return prisma.station.findFirst({
      where: {
        OR: [{ zaloGroupId: msg.groupId }, { zaloDebtGroupId: msg.groupId }],
        isActive: true,
      },
      select: { id: true, code: true },
    })
  }
  // TODO: 1-1 chat needs a sender->station mapping (employee config) — not yet available.
  return null
}

async function findOrCreateShift(stationId: string, timestamp: number) {
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

async function runShiftExtraction(photoId: string, buffer: Buffer): Promise<void> {
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
}

/**
 * Stores each image from a Zalo message and (for shift photos) triggers AI
 * extraction in the background. Designed to be called fire-and-forget so the
 * webhook can reply within Zalo's ~5s window.
 */
export async function handleZaloImageMessage(msg: ZaloImageMessage): Promise<void> {
  const station = await findStationForMessage(msg)
  if (!station) {
    logger.warn({ groupId: msg.groupId, senderId: msg.senderId }, 'No station mapping for message')
    return
  }

  const kind = classifyZaloMessage(msg.caption)

  for (let i = 0; i < msg.imageUrls.length; i++) {
    const url = msg.imageUrls[i]!
    try {
      const buffer = await downloadZaloAttachment(url)
      const path = `${station.code}/${kind}/${msg.messageId}-${i}.jpg`
      await uploadPhoto(path, buffer)

      const shift = kind === 'shift' ? await findOrCreateShift(station.id, msg.timestamp) : null

      const photo = await prisma.shiftPhoto.create({
        data: {
          shiftId: shift?.id ?? null,
          source: 'zalo',
          zaloMessageId: msg.messageId,
          zaloSenderUserId: msg.senderId,
          zaloSenderName: msg.senderName,
          zaloGroupId: msg.groupId,
          zaloReceivedAt: new Date(msg.timestamp),
          storageUrl: path,
          storagePath: path,
          fileSizeBytes: buffer.byteLength,
          matchStatus: 'unmatched',
        },
      })

      if (kind === 'shift') {
        void runShiftExtraction(photo.id, buffer).catch((error) =>
          logger.error({ error, photoId: photo.id }, 'Shift extraction failed')
        )
      }
      // Debt photos are extracted + paired in the per-trip debt pipeline.
    } catch (error) {
      logger.error({ error, url }, 'Failed to process Zalo image')
    }
  }
}
