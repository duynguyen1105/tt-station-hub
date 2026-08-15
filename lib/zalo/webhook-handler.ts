import { classifyPhoto, extractMeter } from '@/lib/ai/extract-meter'
import { extractTankDip } from '@/lib/ai/extract-tank-dip'
import { extractVisitMeter } from '@/lib/ai/extract-visit'
import type {
  ExtractMeterResult,
  ExtractTankDipResult,
  ExtractVisitResult,
  RouterResult,
} from '@/lib/ai/types'
import { sweepStrayDebtMeters } from '@/lib/debts/stray-sweep'
import { logger } from '@/lib/logger'
import {
  getOrCreateUnknownStation,
  matchStationByDeclaration,
  matchStationByLabel,
} from '@/lib/matching/station-label'
import { submitterKey } from '@/lib/matching/submitter'
import {
  assembleDebtVisit,
  findOrCreateShift,
  ingestTankDip,
  runShiftExtraction,
} from '@/lib/photos/ingest'
import { prisma } from '@/lib/prisma'
import { uploadPhoto } from '@/lib/storage/photo-storage'
import { classifyZaloMessage, explicitCaptionKind, routePhoto } from '@/lib/zalo/classify'
import { downloadZaloAttachment, sendZaloMessage } from '@/lib/zalo/client'

// How far back a label-less photo looks for its sender's other labeled photos
// (one Zalo burst spreads over seconds; different stations arrive minutes apart).
const BATCH_CONTEXT_WINDOW_MS = 5 * 60 * 1000

// How long a typed declaration ("chốt ca daknong1") keeps routing the sender's
// photos. Forwarding a whole shift batch takes a while, so the window slides:
// every photo that uses the context re-stamps declaredAt.
export const DECLARED_CONTEXT_WINDOW_MS = 15 * 60 * 1000

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

export type ZaloTextMessage = {
  senderId: string
  text: string
  timestamp: number
}

/**
 * Extracts a TEXT-ONLY message from a Zalo webhook payload, or null if the
 * event carries images (those go through parseZaloEvent) or no usable text.
 * Needed for the forward flow: photos forwarded from another group arrive as
 * bare image messages, and the "chốt ca daknong1" declaration is its own
 * separate text message.
 */
export function parseZaloTextEvent(payload: unknown): ZaloTextMessage | null {
  if (typeof payload !== 'object' || payload === null) return null
  const event = payload as RawZaloEvent

  const hasImages = (event.message?.attachments ?? []).some((a) => a.type === 'image')
  if (hasImages) return null
  const text = event.message?.text?.trim()
  const senderId = event.sender?.id
  if (!text || !senderId) return null

  const rawTs = typeof event.timestamp === 'string' ? Number(event.timestamp) : event.timestamp
  const timestamp = typeof rawTs === 'number' && Number.isFinite(rawTs) ? rawTs : Date.now()
  return { senderId, text, timestamp }
}

/**
 * Reads a routing declaration out of a text message ("chốt ca daknong1",
 * "công nợ đăk nông 2") and remembers it as the sender's context, so the
 * caption-less forwarded photos that follow inherit both the kind and the
 * station. Ordinary chatter (no kind, no station) is ignored and does NOT
 * clear an existing declaration mid-forward.
 */
export async function handleZaloTextMessage(msg: ZaloTextMessage): Promise<void> {
  const kind = explicitCaptionKind(msg.text)
  const station = await matchStationByDeclaration(msg.text)
  if (!kind && !station) return

  await prisma.zaloSenderContext.upsert({
    where: { zaloUserId: msg.senderId },
    create: {
      zaloUserId: msg.senderId,
      stationId: station?.id ?? null,
      kind,
      declaredAt: new Date(msg.timestamp),
    },
    update: {
      stationId: station?.id ?? null,
      kind,
      declaredAt: new Date(msg.timestamp),
    },
  })
  logger.info(
    { senderId: msg.senderId, kind, station: station?.code ?? null },
    'Zalo text declaration stored as sender context'
  )

  if (process.env.ZALO_AUTO_REPLY === 'true') {
    const kindLabel =
      kind === 'shift'
        ? 'chốt ca'
        : kind === 'debt'
          ? 'công nợ'
          : kind === 'inventory'
            ? 'tồn kho'
            : null
    const parts = [kindLabel, station?.code].filter(Boolean).join(' — ')
    const reply = `✅ Đã ghi nhận "${parts}". Ảnh gửi/chuyển tiếp trong 15 phút tới sẽ được xếp vào đó.`
    await sendZaloMessage(msg.senderId, reply).catch((error) =>
      logger.error({ error }, 'Zalo context confirm reply failed')
    )
  }
}

/** The sender's still-fresh typed declaration, or null. */
async function findDeclaredContext(senderId: string, timestamp: number) {
  const context = await prisma.zaloSenderContext.findFirst({
    where: {
      zaloUserId: senderId,
      declaredAt: { gte: new Date(timestamp - DECLARED_CONTEXT_WINDOW_MS) },
    },
  })
  if (!context) return null
  const station = context.stationId
    ? await prisma.station.findFirst({
        where: { id: context.stationId, isActive: true },
        select: { id: true, code: true },
      })
    : null
  return { kind: context.kind as 'shift' | 'debt' | 'inventory' | null, station }
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
  // A typed declaration — the caption on this very message, or the sender's
  // recent text (the forward flow: "chốt ca daknong1" arrives as its own
  // message, the photos follow caption-less) — beats group mapping and sender
  // registration. It does NOT beat the label printed in the photo: text can
  // carry a typo, the plate on the pump cannot, so the label stays the most
  // trusted source and wins whenever it is readable (with a typo warning).
  const explicitKind = explicitCaptionKind(msg.caption)
  const captionStation = msg.caption ? await matchStationByDeclaration(msg.caption) : null
  const context =
    explicitKind && captionStation
      ? null
      : await findDeclaredContext(msg.senderId, msg.timestamp).catch(() => null)
  const declaredKind = explicitKind ?? context?.kind ?? null
  const declaredStation = captionStation ?? context?.station ?? null

  // Slide the declaration window while the burst keeps flowing, so a long
  // forward (many photos over many minutes) never falls out of context halfway.
  if (declaredKind || declaredStation) {
    await prisma.zaloSenderContext
      .upsert({
        where: { zaloUserId: msg.senderId },
        create: {
          zaloUserId: msg.senderId,
          stationId: declaredStation?.id ?? null,
          kind: declaredKind,
          declaredAt: new Date(msg.timestamp),
        },
        update: {
          stationId: declaredStation?.id ?? null,
          kind: declaredKind,
          declaredAt: new Date(msg.timestamp),
        },
      })
      .catch((error) => logger.error({ error }, 'Sliding the sender context failed'))
  }

  let station = declaredStation ?? (await findStationForMessage(msg))

  // Buffers/extractions produced while identifying the station from photo content —
  // reused by the main loop so nothing is downloaded or AI-read twice.
  const preBuffers = new Map<number, Buffer>()
  const preRouters = new Map<number, RouterResult>()
  const preResults = new Map<number, ExtractMeterResult>()
  const preVisitResults = new Map<number, ExtractVisitResult>()
  const preTankResults = new Map<number, ExtractTankDipResult>()

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
          router.image_type === 'mechanical_meter' ||
          // Router blind spot ('label_only') photos still often carry a
          // readable label — extractMeter's reader fallback handles them.
          router.image_type === 'label_only'
        ) {
          const result = await extractMeter({ imageBuffer: buffer, router })
          preResults.set(i, result)
          if (result.stationLabel) {
            station = await matchStationByLabel(result.stationLabel)
          }
        } else if (router.image_type === 'tank_dip') {
          // The official tank plates print the station on the first line
          // ("DAKNONG1 / HẦM 1 / DO -15K"), so dip photos route themselves too.
          const dip = await extractTankDip({ imageBuffer: buffer })
          preTankResults.set(i, dip)
          if (dip.stationLabel) {
            station = await matchStationByLabel(dip.stationLabel)
          }
        }
        // vehicle / unclear: no readable station label — skip.
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

  // An EXPLICIT caption on THIS message ("chốt ca" / "công nợ" / "tồn kho" /
  // "đo bồn") is authoritative for every photo in it — the human declared the
  // intent, so the image classifier cannot override it. A kind remembered from
  // an earlier text is weaker (see routePhoto's declaredFallback): it fills in
  // where the image is ambiguous but never overrides a clear classification.
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
      // The caption typed on THIS message keeps full authority. A kind carried
      // over from the sender's earlier text is only a fallback: it decides the
      // cases vision cannot (totalizer vs debt display, unreadable photos) but
      // never overrides a clear classification — a "công nợ" text five minutes
      // ago must not turn a tank-dip photo into a debt visit.
      const contextKind = explicitKind ? null : (context?.kind ?? null)
      const route =
        explicitKind ??
        (router
          ? routePhoto(router.image_type, captionKind, contextKind)
          : (contextKind ?? captionKind))

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
          // The printed plate on the pump is the most trustworthy source — a
          // typed declaration can carry a typo, the plate cannot. It still
          // overrides everything, INCLUDING the declaration (which then only
          // shows up in the log as a typo suspicion).
          const byLabel = await matchStationByLabel(extracted.stationLabel)
          if (byLabel && byLabel.id !== station.id) {
            logger.info(
              { from: station.code, to: byLabel.code, label: extracted.stationLabel },
              'Photo station label overrides sender/declared station'
            )
            target = byLabel
          }
          if (byLabel && declaredStation && byLabel.id !== declaredStation.id) {
            logger.warn(
              { declared: declaredStation.code, label: byLabel.code },
              'Typed declaration disagrees with the printed label — label wins (typo?)'
            )
          }
        } else if (declaredStation) {
          // No readable label on this photo: the typed declaration already set
          // the station, and it is more direct than the batch context below.
        } else {
          // No station label (e.g. the plate's first line was cropped out of
          // frame). The sender may be touring several stations back-to-back, so
          // their registered station can be one batch stale — prefer the label
          // the SAME sender's other photos carried in the last few minutes.
          const recent = await prisma.shiftPhoto.findFirst({
            where: {
              zaloSenderUserId: msg.senderId,
              extractedStationCode: { not: null },
              zaloReceivedAt: { gte: new Date(msg.timestamp - BATCH_CONTEXT_WINDOW_MS) },
            },
            orderBy: { zaloReceivedAt: 'desc' },
            select: { extractedStationCode: true },
          })
          if (recent?.extractedStationCode) {
            const byBatch = await matchStationByLabel(recent.extractedStationCode)
            if (byBatch && byBatch.id !== station.id) {
              logger.info(
                { from: station.code, to: byBatch.code, label: recent.extractedStationCode },
                'Label-less photo follows the station of the sender-batch context'
              )
              target = byBatch
            }
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
          // Fixed before any AI reads anything, so both halves of one fill agree
          // on it even when they disagree about the station.
          submittedBy: submitterKey('zalo', msg.senderId),
          precomputedMeter: preVisitResults.get(i),
        }).catch((error) =>
          logger.error({ error, photoId: photo.id }, 'Debt visit assembly failed')
        )
      } else if (route === 'inventory') {
        await ingestTankDip(photo.id, buffer, preTankResults.get(i), station).catch((error) =>
          logger.error({ error, photoId: photo.id }, 'Tank-dip ingest failed')
        )
      }
      received++
    } catch (error) {
      logger.error({ error, url }, 'Failed to process Zalo image')
    }
  }

  // Rescue pass: a meter-only debt visit still unpaired after 1 minute was a
  // misclassified shift photo (real debt fills always arrive as a pair) —
  // reroute it into the shift pipeline. Runs here because there is no cron.
  // Currently a no-op: the sweep is frozen (see SWEEP_FROZEN in lib/debts/stray-sweep.ts).
  await sweepStrayDebtMeters().catch((error) =>
    logger.error({ error }, 'Stray debt-meter sweep failed')
  )

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
