import { classifyImageType } from '@/lib/ai/extract-meter'
import { logger } from '@/lib/logger'
import { assembleDebtVisit, findOrCreateShift, runShiftExtraction } from '@/lib/photos/ingest'
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

async function findStationForMessage(msg: ZaloImageMessage) {
  // Group routing: a station that owns this Zalo group.
  if (msg.groupId) {
    const byGroup = await prisma.station.findFirst({
      where: {
        OR: [{ zaloGroupId: msg.groupId }, { zaloDebtGroupId: msg.groupId }],
        isActive: true,
      },
      select: { id: true, code: true },
    })
    if (byGroup) return byGroup
  }

  // 1-1 chat: only a registered, active staff sender is accepted (allowlist).
  const sender = await prisma.zaloSender.findFirst({
    where: { zaloUserId: msg.senderId, isActive: true },
    select: { stationId: true },
  })
  if (sender) {
    const station = await prisma.station.findFirst({
      where: { id: sender.stationId, isActive: true },
      select: { id: true, code: true },
    })
    if (station) return station
  }

  // Explicit pilot override — off unless ZALO_DEFAULT_STATION_CODE is set.
  const defaultCode = process.env.ZALO_DEFAULT_STATION_CODE
  if (defaultCode) {
    return prisma.station.findFirst({
      where: { code: defaultCode, isActive: true },
      select: { id: true, code: true },
    })
  }

  // Unknown sender / unmapped group: ignore, but log the id so an admin can
  // register a legitimate staff member via the zalo_senders allowlist.
  logger.warn(
    { senderId: msg.senderId, groupId: msg.groupId },
    'Unregistered Zalo sender — ignored. Register with scripts/register-zalo-sender.ts to enable.'
  )
  return null
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

      if (kind === 'shift' && shift) {
        void runShiftExtraction(photo.id, buffer, { id: shift.id, stationId: station.id }).catch(
          (error) => logger.error({ error, photoId: photo.id }, 'Shift extraction failed')
        )
      } else if (kind === 'debt') {
        // Classify meter vs vehicle, then create/pair the per-trip debt visit.
        void (async () => {
          const cls = await classifyImageType(buffer)
          await assembleDebtVisit({
            photoId: photo.id,
            station: { id: station.id },
            timestamp: msg.timestamp,
            type: cls === 'vehicle' ? 'vehicle' : 'debt_meter',
            buffer,
          })
        })().catch((error) =>
          logger.error({ error, photoId: photo.id }, 'Debt visit assembly failed')
        )
      }
    } catch (error) {
      logger.error({ error, url }, 'Failed to process Zalo image')
    }
  }
}
