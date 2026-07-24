// Staff intentionally photograph the SAME totalizer twice to cross-check the
// read. When a second photo lands on an already-filled reading slot we must not
// silently overwrite: agreeing duplicates confirm each other, diverging reads
// keep the higher-confidence value and force the row into review (both photos
// stay visible to the reviewer via matchedReadingId).

export type SlotRead = {
  value: number | null
  conf: number | null
  photoId: string | null
}

export type ResolvedSlot = SlotRead & { mismatch: boolean }

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
    const conf =
      next.conf === null
        ? prior.conf
        : prior.conf === null
          ? next.conf
          : Math.max(next.conf, prior.conf)
    return { value: prior.value, conf, photoId: prior.photoId, mismatch: false }
  }
  // Diverging reads: provisionally trust the higher-confidence photo, but flag
  // the row so the accountant must compare both photos before approving.
  const winner = (next.conf ?? 0) >= (prior.conf ?? 0) ? next : prior
  return { value: winner.value, conf: winner.conf, photoId: winner.photoId, mismatch: true }
}
