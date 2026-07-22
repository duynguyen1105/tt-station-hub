import { callClaudeVision, parseJsonFromText } from '@/lib/ai/claude-vision'
import { prepareImageForAI } from '@/lib/ai/image-prep'
import { isAiMockEnabled, mockDelay } from '@/lib/ai/mock'
import { DEBT_METER_PROMPT, VEHICLE_PROMPT } from '@/lib/ai/prompts'
import {
  type ExtractPlateResult,
  type ExtractVisitResult,
  debtMeterSchema,
  vehiclePlateSchema,
} from '@/lib/ai/types'

/** Parses a displayed numeric string ("4.3", "27,760") to a number, or null. */
export function parseNumericString(value: string | null): number | null {
  if (value == null) return null
  const cleaned = value.replace(/,/g, '').trim()
  if (cleaned === '') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/**
 * Whether the computed amount matches the displayed amount once the meter's
 * digit-dropping on large totals is accounted for (build plan §5.6): the
 * display may drop the last 1 digit, or 2 digits above ~10,000,000.
 *
 * Returns false when they cannot be reconciled — which also surfaces the §12.2
 * liters-format ambiguity (e.g. 4.3 L vs 43 L produces a 10× mismatch).
 *
 * NOTE: thresholds/behavior to be validated during the pilot with real photos.
 */
export function checkAmountMatch(computed: number, displayed: string | null): boolean {
  if (displayed == null) return false
  const displayedClean = displayed.replace(/\D/g, '')
  if (displayedClean === '') return false
  const c = Math.round(computed)
  const candidates = new Set([
    c.toString(),
    Math.floor(c / 10).toString(),
    Math.floor(c / 100).toString(),
  ])
  return candidates.has(displayedClean)
}

function mockVisit(): ExtractVisitResult {
  const computed = Math.round(43.0 * 27760)
  return {
    meterType: 'debt_meter',
    displayedAmount: '1193680',
    liters: '43.0',
    unitPrice: '27760',
    stationLabel: null,
    dispenserLabel: 'TRỤ 1',
    fuelType: 'DO',
    computedAmount: computed,
    amountMatchesDisplay: checkAmountMatch(computed, '1193680'),
    litersConfidence: 96,
    unitPriceConfidence: 97,
    amountConfidence: 70,
    notes: 'mock debt visit',
    raw: { mock: true },
  }
}

/**
 * Reads a debt (per-trip) meter: liters + unit price, then computes the true
 * amount (liters × unit price) and checks it against the displayed amount.
 */
export async function extractVisitMeter(input: {
  imageBuffer?: Buffer | Uint8Array
}): Promise<ExtractVisitResult> {
  if (isAiMockEnabled()) {
    await mockDelay()
    return mockVisit()
  }
  if (!input.imageBuffer) {
    throw new Error('extractVisitMeter requires an imageBuffer when AI_MOCK is off')
  }

  const image = await prepareImageForAI(input.imageBuffer)
  const text = await callClaudeVision({ prompt: DEBT_METER_PROMPT, images: [image] })
  const parsed = debtMeterSchema.parse(parseJsonFromText(text))

  const liters = parseNumericString(parsed.liters)
  const unitPrice = parseNumericString(parsed.unit_price)
  const computedAmount = liters != null && unitPrice != null ? Math.round(liters * unitPrice) : null
  const amountMatchesDisplay =
    computedAmount != null ? checkAmountMatch(computedAmount, parsed.displayed_amount) : null

  return {
    meterType: parsed.meter_type,
    displayedAmount: parsed.displayed_amount,
    liters: parsed.liters,
    unitPrice: parsed.unit_price,
    stationLabel: parsed.station_label ?? null,
    dispenserLabel: parsed.dispenser_label ?? null,
    fuelType: parsed.fuel_type ?? null,
    computedAmount,
    amountMatchesDisplay,
    litersConfidence: parsed.confidence.liters,
    unitPriceConfidence: parsed.confidence.unit_price,
    amountConfidence: parsed.confidence.amount,
    notes: parsed.notes,
    raw: parsed,
  }
}

/** Reads a vehicle license plate. */
export async function extractPlate(input: {
  imageBuffer?: Buffer | Uint8Array
}): Promise<ExtractPlateResult> {
  if (isAiMockEnabled()) {
    await mockDelay()
    return { plate: '51C-12345', confidence: 88, notes: 'mock plate' }
  }
  if (!input.imageBuffer) {
    throw new Error('extractPlate requires an imageBuffer when AI_MOCK is off')
  }

  const image = await prepareImageForAI(input.imageBuffer)
  const text = await callClaudeVision({ prompt: VEHICLE_PROMPT, images: [image], maxTokens: 200 })
  const parsed = vehiclePlateSchema.parse(parseJsonFromText(text))

  return {
    plate: parsed.plate.toLowerCase() === 'unclear' ? null : parsed.plate,
    confidence: parsed.confidence,
    notes: parsed.notes,
  }
}
