import { classifyPhoto, extractMeter } from '@/lib/ai/extract-meter'
import { extractVisitMeter } from '@/lib/ai/extract-visit'
import type { ExtractMeterResult, ExtractVisitResult, RouterResult } from '@/lib/ai/types'
import { logger } from '@/lib/logger'
import { getOrCreateUnknownStation, matchStationByLabel } from '@/lib/matching/station-label'
import {
  assembleDebtVisit,
  findOrCreateShift,
  ingestTankDip,
  runShiftExtraction,
} from '@/lib/photos/ingest'
import { prisma } from '@/lib/prisma'
import { uploadPhoto } from '@/lib/storage/photo-storage'
import { classifyZaloMessage, routePhoto } from '@/lib/zalo/classify'
import { downloadZaloAttachment, sendZaloMessage } from '@/lib/zalo/client'

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

  // PILOT (no sender restriction yet): if there is exactly one active station,
  // accept any sender and route to it. TODO(§12.3): once multiple stations are
  // active, register staff senders (zalo_senders) or map station groups instead.
  const active = await prisma.station.findMany({
    where: { isActive: true },
    select: { id: true, code: true },
    take: 2,
  })
  if (active.length === 1) return active[0]!

  logger.warn(
    { senderId: msg.senderId, groupId: msg.groupId },
    'No station mapping for message — register a sender or map a group.'
  )
  return null
}

/**
 * Stores each image from a Zalo message and (for shift photos) triggers AI
 * extraction in the background. Designed to be called fire-and-forget so the
 * webhook can reply within Zalo's ~5s window.
 */
export async function handleZaloImageMessage(msg: ZaloImageMessage): Promise<void> {
  let station = await findStationForMessage(msg)

  // Buffers/extractions produced while identifying the station from photo content —
  // reused by the main loop so nothing is downloaded or AI-read twice.
  const preBuffers = new Map<number, Buffer>()
  const preRouters = new Map<number, RouterResult>()
  const preResults = new Map<number, ExtractMeterResult>()
  const preVisitResults = new Map<number, ExtractVisitResult>()

  if (!station) {
    // Unknown sender: try to identify the station from the printed label in the
    // photos themselves ("ĐAKNONG 1 / TRU 1 – DO"). Both shift totalizers AND debt
    // pump displays carry it, so classify first and read with the matching
    // extractor. A random stranger's photo won't match any label, so this stays safe.
    for (let i = 0; i < msg.imageUrls.length && !station; i++) {
      try {
        const buffer = await downloadZaloAttachment(msg.imageUrls[i]!)
        preBuffers.set(i, buffer)
        const router = await classifyPhoto(buffer).catch(() => null)
        if (!router) continue
        preRouters.set(i, router)
        if (router.image_type === 'debt_meter') {
          const visitMeter = await extractVisitMeter({ imageBuffer: buffer })
          preVisitResults.set(i, visitMeter)
          if (visitMeter.stationLabel) {
            station = await matchStationByLabel(visitMeter.stationLabel)
          }
        } else if (
          router.image_type === 'electronic_meter' ||
          router.image_type === 'mechanical_meter'
        ) {
          const result = await extractMeter({ imageBuffer: buffer, router })
          preResults.set(i, result)
          if (result.stationLabel) {
            station = await matchStationByLabel(result.stationLabel)
          }
        }
        // vehicle / tank_dip / unclear: no readable station label — skip.
      } catch (error) {
        logger.error({ error, index: i }, 'Station-label identification failed for image')
      }
    }

    if (station) {
      // Self-registration: bind this sender to the identified station so their next
      // messages route instantly (no extra AI pass). Never overwrites an existing row.
      if (msg.senderId) {
        await prisma.zaloSender
          .upsert({
            where: { zaloUserId: msg.senderId },
            create: {
              zaloUserId: msg.senderId,
              stationId: station.id,
              displayName: msg.senderName ?? 'Tự đăng ký theo nhãn trạm',
            },
            update: {},
          })
          .catch((error) => logger.error({ error }, 'Sender self-registration failed'))
      }
      logger.info(
        { senderId: msg.senderId, station: station.code },
        'Routed by station label from photo content; sender self-registered'
      )
    } else {
      // Never drop the photos: park them on the UNKNOWN holding station so they
      // reach the review queue, where the accountant assigns the real station via
      // the dropdown. The sender is NOT self-registered to it.
      station = await getOrCreateUnknownStation()
      logger.warn(
        { groupId: msg.groupId, senderId: msg.senderId },
        'No station identified — photos parked on the UNKNOWN station for manual assignment'
      )
    }
  }

  // Caption is a hint; the per-photo image content is the real decider (below).
  const captionKind = classifyZaloMessage(msg.caption)
  let received = 0

  for (let i = 0; i < msg.imageUrls.length; i++) {
    const url = msg.imageUrls[i]!
    try {
      const buffer = preBuffers.get(i) ?? (await downloadZaloAttachment(url))
      const pre = preResults.get(i)

      // Classify once, then route by what the AI sees — a vehicle plate or a
      // transaction display is a debt fill, a cumulative totalizer is a shift
      // reading, a HẦM tank-dip is inventory — falling back to the caption when the
      // image is ambiguous. The router result is reused by the extractors below so
      // we never pay for a second classification.
      const router =
        preRouters.get(i) ??
        (pre
          ? ((pre.raw as { router?: RouterResult })?.router ?? null)
          : await classifyPhoto(buffer).catch(() => null))
      const route = router ? routePhoto(router.image_type, captionKind) : captionKind

      // For shift photos the meter is extracted anyway, so read it now and let the
      // PRINTED STATION LABEL override the sender-based station when they disagree
      // (e.g. a tester registered to one station sending another station's photo).
      // Debt/inventory photos rarely carry a label and keep the sender's station.
      let target = station
      let extracted: ExtractMeterResult | undefined = pre
      if (route === 'shift') {
        extracted =
          pre ??
          (await extractMeter({ imageBuffer: buffer, router: router ?? undefined }).catch(
            () => undefined
          ))
        if (extracted?.stationLabel) {
          const byLabel = await matchStationByLabel(extracted.stationLabel)
          if (byLabel && byLabel.id !== station.id) {
            logger.info(
              { from: station.code, to: byLabel.code, label: extracted.stationLabel },
              'Photo station label overrides sender station'
            )
            target = byLabel
          }
        }
      }

      const path = `${target.code}/${route}/${msg.messageId}-${i}.jpg`
      await uploadPhoto(path, buffer)

      const shift = route === 'shift' ? await findOrCreateShift(target.id, msg.timestamp) : null

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

      // Awaited (not fire-and-forget) so processing completes within the webhook's
      // after() window on serverless — otherwise the function freezes first.
      if (route === 'shift' && shift) {
        await runShiftExtraction(
          photo.id,
          buffer,
          { id: shift.id, stationId: target.id },
          undefined,
          router ?? undefined,
          extracted
        ).catch((error) => logger.error({ error, photoId: photo.id }, 'Shift extraction failed'))
      } else if (route === 'debt') {
        await assembleDebtVisit({
          photoId: photo.id,
          station: { id: station.id },
          timestamp: msg.timestamp,
          type: router?.image_type === 'vehicle' ? 'vehicle' : 'debt_meter',
          buffer,
          caption: msg.caption,
          precomputedMeter: preVisitResults.get(i),
        }).catch((error) =>
          logger.error({ error, photoId: photo.id }, 'Debt visit assembly failed')
        )
      } else if (route === 'inventory') {
        await ingestTankDip(photo.id, buffer).catch((error) =>
          logger.error({ error, photoId: photo.id }, 'Tank-dip ingest failed')
        )
      }
      received++
    } catch (error) {
      logger.error({ error, url }, 'Failed to process Zalo image')
    }
  }

  // Best-effort receipt confirmation back to the sender. Gated behind ZALO_AUTO_REPLY
  // because the OA send-message API (v3.0/oa/message/cs) requires a paid OA tier
  // package — it returns error -224 otherwise. Enable once the OA is upgraded.
  if (received > 0 && process.env.ZALO_AUTO_REPLY === 'true') {
    const text = `✅ Trường Thịnh đã nhận ${received} ảnh. Hệ thống đang xử lý, kế toán sẽ kiểm tra và duyệt. Cảm ơn!`
    await sendZaloMessage(msg.senderId, text).catch((error) =>
      logger.error({ error }, 'Zalo confirm reply failed')
    )
  }
}
