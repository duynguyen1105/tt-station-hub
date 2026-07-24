// Staff intentionally photograph the SAME totalizer twice to cross-check the
// read. When a second photo lands on an already-filled reading slot we must not
// silently overwrite: agreeing duplicates confirm each other, diverging reads
// keep the higher-confidence value and force the row into review (both photos
// stay visible to the reviewer via matchedReadingId).

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
