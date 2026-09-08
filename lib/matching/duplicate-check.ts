// Staff intentionally photograph the SAME totalizer twice to cross-check the
// read. When a second photo lands on an already-filled reading slot we must not
// silently overwrite: agreeing duplicates confirm each other, diverging reads
// keep the higher-confidence value and force the row into review (both photos
// stay visible to the reviewer via matchedReadingId).
import { parseNumericString } from '@/lib/ai/extract-visit'

export type SlotRead = {
  value: number | null
  conf: number | null
  photoId: string | null
  // Display trustworthiness (higher wins a diverging pair): the red-LED
  // Montech / LungBor LCD read far more reliably than the green 3-line
  // dot-matrix, whose digits blur into different garbage on every read — the
  // AI's self-reported confidence does not capture that, so rank beats conf.
  rank?: number
}

export function meterTypeRank(meterType: string | null | undefined): number {
  return meterType === 'electronic_green3' ? 1 : 2
}

export type ScaleResolution = {
  value: number | null
  // True only when the scale was INFERRED from the opening (case c) — a placement
  // by configured decimals is the display's known shape, not a guess.
  rescaled: boolean
}

/**
 * Where the decimal point of an electronic totalizer read goes. Every display
 * type is prone to it: the Montech and LungBor print 2–3 decimals behind a tiny
 * dot the AI often cannot see, so 187883.80 comes back as "18788380", and the
 * PETRO/green displays lose a digit outright. In order:
 *  (a) a dot the AI DID see is trusted as read;
 *  (b) a trụ with configured `electronicDecimals` places the point there;
 *  (c) otherwise the opening decides: of the scales 0..3 the smallest that makes
 *      closing ≥ opening with delta ≤ maxDelta wins, so a raw read whose own
 *      delta is plausible is never touched, and a decimal-less display never is;
 *  (d) nothing plausible (no opening, or every scale absurd): the raw stands.
 */
export function resolveReadingScale(
  raw: string | null,
  opening: number | null,
  maxDeltaLiters: number,
  electronicDecimals: number | null
): ScaleResolution {
  const value = parseNumericString(raw)
  if (value === null || raw!.includes('.')) return { value, rescaled: false }
  if (electronicDecimals !== null) {
    return { value: value / 10 ** electronicDecimals, rescaled: false }
  }
  if (opening === null) return { value, rescaled: false }
  for (let scale = 0; scale <= 3; scale++) {
    const candidate = value / 10 ** scale
    const delta = candidate - opening
    if (delta >= 0 && delta <= maxDeltaLiters) return { value: candidate, rescaled: scale > 0 }
  }
  return { value, rescaled: false }
}

export type ResolvedSlot = SlotRead & { mismatch: boolean }

function bestConf(a: number | null, b: number | null): number | null {
  if (a === null) return b
  if (b === null) return a
  return Math.max(a, b)
}

// A Montech totalizer prints its decimals after a tiny dot the AI easily
// misses: 187883.80 comes back as 18788380. Two reads therefore also agree
// when one equals the other with the dot dropped — i.e. the integer read is
// the decimal read scaled by 100 (2 decimals) or 1000 (3 decimals). Returns
// the decimal-corrected value, or null when the pair isn't such a match.
function missedDotValue(a: number, b: number): number | null {
  const [small, big] = a <= b ? [a, b] : [b, a]
  if (!Number.isInteger(big) || Math.trunc(small) <= 0) return null
  for (const factor of [100, 1000]) {
    if (Math.floor(big / factor) === Math.trunc(small)) return big / factor
  }
  return null
}

// The green 3-line LÍT row shows the INTEGER liters while the Montech prints
// the same value with 2-3 decimal digits. When every green digit — allowing
// the LAST 2 to disagree (rounding / dot-matrix misreads) — matches the
// Montech's leading digits, the green certifies where the integer part ends:
// the remaining 2-3 Montech digits are the decimals. 17143447 anchored by
// green 171474 → 171434.47 (first 4 digits agree, green's tail was misread).
function greenAnchoredValue(montech: number | null, green: number | null): number | null {
  if (montech === null || green === null) return null
  if (!Number.isInteger(montech) || !Number.isInteger(green) || green <= 0) return null
  const m = String(montech)
  const g = String(green)
  const leftover = m.length - g.length
  if (leftover < 2 || leftover > 3) return null
  const anchor = g.length - 2
  // The anchor (all green digits except the tolerated tail) must be long
  // enough to be meaningful and must match the Montech exactly.
  if (anchor < 3) return null
  for (let i = 0; i < anchor; i++) {
    if (m[i] !== g[i]) return null
  }
  return montech / 10 ** leftover
}

export function resolveDuplicateSlot(prior: SlotRead, next: SlotRead): ResolvedSlot {
  // No usable prior read (empty slot, re-ingest of the same photo, or the prior
  // photo was unreadable): the new photo simply takes the slot.
  if (prior.photoId === null || prior.photoId === next.photoId || prior.value === null) {
    return { ...next, mismatch: false }
  }
  // The duplicate is unreadable: the existing read stands.
  if (next.value === null) {
    return { ...prior, mismatch: false }
  }
  // Cross-check passed: keep the confirmed value with the best confidence.
  if (next.value === prior.value) {
    return {
      value: prior.value,
      conf: bestConf(prior.conf, next.conf),
      photoId: prior.photoId,
      mismatch: false,
    }
  }
  // Same integer part: one display shows decimals the other truncates (the
  // 3-line LÍT row prints 187883 while the Montech shows 187883.80). Keep the
  // decimal-precise read.
  if (Math.trunc(next.value) === Math.trunc(prior.value)) {
    return {
      value: !Number.isInteger(prior.value) ? prior.value : next.value,
      conf: bestConf(prior.conf, next.conf),
      photoId: prior.photoId,
      mismatch: false,
    }
  }
  // Missed decimal dot: 18788380 vs 187883 is the SAME read (187883.80) with
  // the tiny Montech dot lost — reconcile to the corrected decimal value.
  const corrected = missedDotValue(prior.value, next.value)
  if (corrected !== null) {
    return {
      value: corrected,
      conf: bestConf(prior.conf, next.conf),
      photoId: prior.photoId,
      mismatch: false,
    }
  }
  // Green-anchored decimals: the trusted display's read is dotless but the
  // green partner's digits match its leading digits — the green certifies the
  // integer part, the leftover trusted digits are decimals.
  const priorIsTrusted = (prior.rank ?? 0) > (next.rank ?? 0)
  const nextIsTrusted = (next.rank ?? 0) > (prior.rank ?? 0)
  if (priorIsTrusted || nextIsTrusted) {
    const trusted = priorIsTrusted ? prior : next
    const green = priorIsTrusted ? next : prior
    const anchored = greenAnchoredValue(trusted.value, green.value)
    if (anchored !== null) {
      return { value: anchored, conf: trusted.conf, photoId: trusted.photoId, mismatch: false }
    }
  }
  // Genuinely diverging reads: provisionally trust the more reliable DISPLAY
  // first (Montech beats the blurry green 3-line regardless of self-reported
  // confidence), then the higher confidence. Flag the row either way so the
  // accountant must compare both photos before approving.
  const priorRank = prior.rank ?? 0
  const nextRank = next.rank ?? 0
  const winner =
    nextRank !== priorRank
      ? nextRank > priorRank
        ? next
        : prior
      : (next.conf ?? 0) >= (prior.conf ?? 0)
        ? next
        : prior
  return { value: winner.value, conf: winner.conf, photoId: winner.photoId, mismatch: true }
}
