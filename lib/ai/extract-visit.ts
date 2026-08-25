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
 * Resolves the decimal scale of the LÍT row using the arithmetic identity the
 * pump itself guarantees: TIỀN = LÍT × ĐƠN GIÁ.
 *
 * These displays print liters with IMPLIED decimals ("350000" means 35.0000 L,
 * "90000" means 9.0000 L) and the dot is often unlit/invisible, so the raw
 * digits alone are ambiguous by powers of ten (§12.2). Instead of trusting the
 * model's guess, try each plausible scale of the digits it read and keep the
 * one whose product reconciles with the money line.
 *
 * Two tiers of reconciliation, because an EXACT digit match is stronger
 * evidence than one that leans on display truncation: a dotted read of "90.00"
 * truncation-matches a displayed 261990 (2,619,900 → 261990), but 9.0000 with
 * the pump's implied decimals matches it EXACTLY — the exact tier wins, which
 * is precisely the 24/08 10× overcharge scenario. Within a tier, the visible
 * dot is preferred, then 4 implied decimals (the convention on every
 * Trường Thịnh pump verified so far), then 3..0. A scale is only ever ACCEPTED
 * when the arithmetic confirms it, so a pump with a different convention
 * resolves correctly too.
 *
 * When nothing reconciles (unreadable price/amount, or a genuinely wrong
 * read), falls back to the literal reading — or the 4-implied-decimals
 * assumption for dotless 5+ digit reads, which errs small rather than 10,000×
 * large — and marks it 'unverified' so review is forced downstream.
 */
export function resolveLiters(
  rawLiters: string | null,
  unitPrice: number | null,
  displayedAmount: string | null
): LitersResolution {
  if (rawLiters == null) return { liters: null, resolution: null }
  const digits = rawLiters.replace(/\D/g, '')
  if (digits === '') return { liters: null, resolution: null }
  const hasDot = rawLiters.includes('.')
  const literal = hasDot ? parseNumericString(rawLiters) : Number(digits)
  const displayedClean = displayedAmount?.replace(/\D/g, '') ?? ''

  const matchTier = (liters: number): 'exact' | 'truncated' | null => {
    if (unitPrice == null || unitPrice <= 0 || liters <= 0 || displayedClean === '') return null
    const c = Math.round(liters * unitPrice)
    if (c.toString() === displayedClean) return 'exact'
    return checkAmountMatch(c, displayedClean) ? 'truncated' : null
  }

  // Candidates in preference order: the visible dot first, then the pump's
  // implied-decimal scales widest-first.
  const base = Number(digits)
  const candidates: number[] = []
  if (literal != null && hasDot) candidates.push(literal)
  if (Number.isFinite(base)) {
    for (const k of [4, 3, 2, 1, 0]) {
      const scaled = base / 10 ** k
      if (!candidates.includes(scaled)) candidates.push(scaled)
    }
  }

  let truncatedHit: number | null = null
  for (const candidate of candidates) {
    const tier = matchTier(candidate)
    if (tier === 'exact') {
      return {
        liters: candidate,
        resolution: literal != null && candidate === literal ? 'verified' : 'rescaled',
      }
    }
    if (tier === 'truncated' && truncatedHit == null) truncatedHit = candidate
  }
  if (truncatedHit != null) {
    return {
      liters: truncatedHit,
      resolution: literal != null && truncatedHit === literal ? 'verified' : 'rescaled',
    }
  }

  // Nothing reconciles: keep the literal read when it carries its own dot;
  // otherwise assume the pump-standard 4 implied decimals on long reads.
  const fallback =
    literal != null && hasDot
      ? literal
      : digits.length >= 5 && Number.isFinite(base)
        ? base / 10 ** 4
        : Number.isFinite(base)
          ? base
          : null
  return { liters: fallback, resolution: fallback == null ? null : 'unverified' }
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

  const unitPrice = parseNumericString(parsed.unit_price)
  const { liters, resolution } = resolveLiters(parsed.liters, unitPrice, parsed.displayed_amount)
  const computedAmount = liters != null && unitPrice != null ? Math.round(liters * unitPrice) : null
  const amountMatchesDisplay =
    computedAmount != null ? checkAmountMatch(computedAmount, parsed.displayed_amount) : null

  return {
    meterType: parsed.meter_type,
    displayedAmount: parsed.displayed_amount,
    liters: parsed.liters,
    litersResolved: liters,
    litersResolution: resolution,
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
