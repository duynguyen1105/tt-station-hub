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
import { DEFAULT_LITERS_DECIMALS } from '@/lib/debts/liters-decimals'

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
 * display drops the last digit when the amount overflows its cells (≥ 7
 * digits, i.e. ≥ 1,000,000 — seen live: 1,018,850 shown as 101885), and the
 * tens digit too above ~10,000,000.
 *
 * The truncated candidates are GATED on the computed amount actually being
 * large enough to overflow: an ungated /10 candidate let a 10× liters misread
 * (90.00 vs 9.00) reconcile with the display and wear a green "Khớp" badge.
 *
 * Returns false when they cannot be reconciled — which also surfaces the §12.2
 * liters-format ambiguity (e.g. 4.3 L vs 43 L produces a 10× mismatch).
 */
export function checkAmountMatch(computed: number, displayed: string | null): boolean {
  if (displayed == null) return false
  const displayedClean = displayed.replace(/\D/g, '')
  if (displayedClean === '') return false
  const c = Math.round(computed)
  const candidates = new Set([c.toString()])
  if (c >= 1_000_000) candidates.add(Math.floor(c / 10).toString())
  if (c >= 10_000_000) candidates.add(Math.floor(c / 100).toString())
  return candidates.has(displayedClean)
}

export type LitersResolution = {
  liters: number | null
  resolution: 'verified' | 'rescaled' | 'unverified' | null
}

/**
 * Resolves the decimal scale of the LÍT row.
 *
 * These displays print liters with IMPLIED decimals ("340000" means 340.000 L)
 * and the dot is often unlit/invisible, so the raw digits alone are ambiguous by
 * powers of ten (§12.2). The pump's arithmetic identity TIỀN = LÍT × ĐƠN GIÁ is
 * a CHECK, not a chooser: because the money row drops its last digit above
 * 1,000,000, "340000" reconciles with a displayed 989740 both as 34 L (exact)
 * and as 340 L (9,897,400 truncated) — the 26/08 ×10 undercharge came from
 * letting the exact tier pick 34. So the scale is chosen by evidence in this
 * order, and arithmetic only confirms or rejects it:
 *
 * 1. a dot the model actually SAW ("182.000") — the display's own statement;
 * 2. the trạm's configured implied decimals (`impliedDecimals`);
 * 3. any other scale of the same digits, marked 'rescaled' — the read only
 *    adds up at a scale the pump does not use, so a digit was likely dropped
 *    or doubled (or the trạm's convention is misconfigured) and review is
 *    forced upstream.
 *
 * When nothing reconciles (unreadable price/amount, or a genuinely wrong read),
 * falls back to the literal dotted read or the convention scale and marks it
 * 'unverified' so review is forced downstream.
 */
export function resolveLiters(
  rawLiters: string | null,
  unitPrice: number | null,
  displayedAmount: string | null,
  impliedDecimals: number = DEFAULT_LITERS_DECIMALS
): LitersResolution {
  if (rawLiters == null) return { liters: null, resolution: null }
  const digits = rawLiters.replace(/\D/g, '')
  if (digits === '') return { liters: null, resolution: null }
  const hasDot = rawLiters.includes('.')
  const literal = hasDot ? parseNumericString(rawLiters) : null
  const base = Number(digits)
  if (!Number.isFinite(base)) return { liters: null, resolution: null }
  const displayedClean = displayedAmount?.replace(/\D/g, '') ?? ''

  const reconciles = (liters: number): boolean => {
    if (unitPrice == null || unitPrice <= 0 || liters <= 0 || displayedClean === '') return false
    return checkAmountMatch(Math.round(liters * unitPrice), displayedClean)
  }

  const conventional = base / 10 ** impliedDecimals
  if (literal != null && reconciles(literal)) return { liters: literal, resolution: 'verified' }
  if (reconciles(conventional)) return { liters: conventional, resolution: 'verified' }
  for (const k of [4, 3, 2, 1, 0]) {
    if (k === impliedDecimals) continue
    const scaled = base / 10 ** k
    if (scaled !== literal && reconciles(scaled)) return { liters: scaled, resolution: 'rescaled' }
  }

  // Nothing reconciles: a dotted read keeps its dot; a dotless read long enough
  // to carry the implied decimals gets them, a shorter one is kept whole.
  const fallback = literal ?? (digits.length > impliedDecimals ? conventional : base)
  return { liters: fallback, resolution: 'unverified' }
}

function mockVisit(): ExtractVisitResult {
  const computed = Math.round(43.0 * 27760)
  return {
    meterType: 'debt_meter',
    displayedAmount: '1193680',
    liters: '43.0',
    litersResolved: 43,
    litersResolution: 'verified',
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
 * Re-places the LÍT decimal of a read under a trạm's convention. The reader runs
 * before the trạm is known (the pump plate in the photo is what identifies it),
 * so extraction resolves under the default and intake re-resolves once the visit
 * has settled on a trạm.
 */
export function placeLitersDecimal(
  meter: ExtractVisitResult,
  impliedDecimals: number
): ExtractVisitResult {
  const unitPrice = parseNumericString(meter.unitPrice)
  const { liters, resolution } = resolveLiters(
    meter.liters,
    unitPrice,
    meter.displayedAmount,
    impliedDecimals
  )
  const computedAmount = liters != null && unitPrice != null ? Math.round(liters * unitPrice) : null
  const amountMatchesDisplay =
    computedAmount != null ? checkAmountMatch(computedAmount, meter.displayedAmount) : null
  return {
    ...meter,
    litersResolved: liters,
    litersResolution: resolution,
    computedAmount,
    amountMatchesDisplay,
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

  return placeLitersDecimal(
    {
      meterType: parsed.meter_type,
      displayedAmount: parsed.displayed_amount,
      liters: parsed.liters,
      litersResolved: null,
      litersResolution: null,
      unitPrice: parsed.unit_price,
      stationLabel: parsed.station_label ?? null,
      dispenserLabel: parsed.dispenser_label ?? null,
      fuelType: parsed.fuel_type ?? null,
      computedAmount: null,
      amountMatchesDisplay: null,
      litersConfidence: parsed.confidence.liters,
      unitPriceConfidence: parsed.confidence.unit_price,
      amountConfidence: parsed.confidence.amount,
      notes: parsed.notes,
      raw: parsed,
    },
    DEFAULT_LITERS_DECIMALS
  )
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
