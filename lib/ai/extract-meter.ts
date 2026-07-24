import { callClaudeVision, parseJsonFromText } from '@/lib/ai/claude-vision'
import { prepareImageForAI } from '@/lib/ai/image-prep'
import { isAiMockEnabled, lookupMockExtraction, mockDelay } from '@/lib/ai/mock'
import { ELECTRONIC_PROMPT, MECHANICAL_PROMPT, ROUTER_PROMPT } from '@/lib/ai/prompts'
import {
  type ElectronicResult,
  type ExtractMeterResult,
  type MechanicalResult,
  type RouterResult,
  electronicSchema,
  mechanicalSchema,
  routerSchema,
} from '@/lib/ai/types'

type ExtractMeterInput = {
  imageBuffer?: Buffer | Uint8Array
  // Identifies which sample fixture to return when AI_MOCK is enabled.
  mockKey?: string
  // Pre-computed router result — lets the webhook classify once (for routing) and
  // reuse it here instead of paying for a second router call.
  router?: RouterResult
}

// The Montech red-LED totalizer ALWAYS renders its last 2 digits as decimals
// behind a tiny dot the AI frequently cannot see (187883.80 comes back as
// "18788380") — confirmed hardware behavior across the Trường Thịnh stations.
// A dotless integer read of 7+ digits is therefore the decimal value with its
// dot dropped: restore it. Shorter reads are left untouched (a genuine
// dot-read may simply have few integer digits), as is any read that already
// carries a dot.
export function restoreMontechDot(reading: string | null): string | null {
  if (reading === null || !/^\d{7,}$/.test(reading)) return reading
  return `${reading.slice(0, -2)}.${reading.slice(-2)}`
}

function normalizeElectronic(result: ElectronicResult, router: RouterResult): ExtractMeterResult {
  return {
    meterType: result.meter_type,
    reading:
      result.meter_type === 'electronic_montech'
        ? restoreMontechDot(result.reading)
        : result.reading,
    stationLabel: result.station_label ?? null,
    dispenserLabel: result.dispenser_label ?? null,
    fuelType: result.fuel_type ?? null,
    readingConfidence: result.confidence.reading,
    labelsConfidence: result.confidence.labels,
    hasUnreadableDigits: false,
    notes: result.notes,
    raw: { router, extraction: result },
  }
}

function normalizeMechanical(result: MechanicalResult, router: RouterResult): ExtractMeterResult {
  return {
    meterType: result.meter_type === 'unclear' ? 'unclear' : 'mechanical',
    reading: result.reading,
    stationLabel: result.station_label ?? null,
    dispenserLabel: result.dispenser_label ?? null,
    fuelType: result.fuel_type ?? null,
    readingConfidence: result.confidence.reading,
    labelsConfidence: result.confidence.labels,
    hasUnreadableDigits: result.has_unreadable_digits,
    notes: result.notes,
    raw: { router, extraction: result },
  }
}

function emptyResult(
  meterType: ExtractMeterResult['meterType'],
  router: RouterResult
): ExtractMeterResult {
  return {
    meterType,
    reading: null,
    stationLabel: null,
    dispenserLabel: null,
    fuelType: null,
    readingConfidence: null,
    labelsConfidence: router.confidence,
    hasUnreadableDigits: false,
    notes: router.notes,
    raw: { router },
  }
}

/**
 * Shift-closing extraction pipeline: classify the photo, then read the meter
 * with the matching prompt. In AI_MOCK mode it returns a fixture instead of
 * calling the API.
 */
export async function extractMeter(input: ExtractMeterInput): Promise<ExtractMeterResult> {
  if (isAiMockEnabled()) {
    await mockDelay()
    return lookupMockExtraction(input.mockKey)
  }

  if (!input.imageBuffer) {
    throw new Error('extractMeter requires an imageBuffer when AI_MOCK is off')
  }

  const image = await prepareImageForAI(input.imageBuffer)

  const router =
    input.router ??
    routerSchema.parse(
      parseJsonFromText(
        await callClaudeVision({ prompt: ROUTER_PROMPT, images: [image], maxTokens: 300 })
      )
    )

  if (router.image_type === 'electronic_meter') {
    const text = await callClaudeVision({ prompt: ELECTRONIC_PROMPT, images: [image] })
    return normalizeElectronic(electronicSchema.parse(parseJsonFromText(text)), router)
  }

  if (router.image_type === 'mechanical_meter') {
    const text = await callClaudeVision({ prompt: MECHANICAL_PROMPT, images: [image] })
    return normalizeMechanical(mechanicalSchema.parse(parseJsonFromText(text)), router)
  }

  // Not a shift-closing meter (debt meter, vehicle, label only, or unrelated).
  return emptyResult(router.image_type === 'not_relevant' ? 'not_a_meter' : 'unclear', router)
}

/**
 * Router-only classification returning the full result — used to route an incoming
 * photo (shift vs debt vs inventory) before extraction, then reused by extractMeter.
 */
export async function classifyPhoto(imageBuffer: Buffer | Uint8Array): Promise<RouterResult> {
  if (isAiMockEnabled()) {
    await mockDelay()
    return { image_type: 'debt_meter', confidence: 80, notes: 'mock' }
  }
  const image = await prepareImageForAI(imageBuffer)
  const text = await callClaudeVision({ prompt: ROUTER_PROMPT, images: [image], maxTokens: 300 })
  return routerSchema.parse(parseJsonFromText(text))
}

/** Router-only classification returning just the image_type. */
export async function classifyImageType(
  imageBuffer: Buffer | Uint8Array
): Promise<RouterResult['image_type']> {
  return (await classifyPhoto(imageBuffer)).image_type
}
