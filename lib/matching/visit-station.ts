// The one rule for which station a debt visit keeps when a photo joins it.
// See docs/adr/0001-pair-debt-photos-by-submitter.md — read it before changing
// this: the inverse (letting a joining vehicle photo write its own station) reads
// like harmless symmetry and is what splits pairs across two stations.

/**
 * Where the joining photo's station came from, strongest first:
 * - 'declared'   — the sender typed it for this message (caption or the still-fresh
 *                  sender context). A human statement about THIS photo.
 * - 'pump_plate' — read off the pump's printed plate. Never the vehicle's number
 *                  plate, which names a customer and not a station.
 * - 'inherited'  — a lookup from who sent it (group, registration, batch).
 */
export type PhotoStationSource = 'declared' | 'pump_plate' | 'inherited'

export type VisitStationInput = {
  /** The station of the debt visit the photo is joining. */
  visitStationId: string
  /** The station the joining photo resolved for itself. */
  photoStationId: string
  photoStationSource: PhotoStationSource
  /** The reserved holding station for photos whose station is undetermined. */
  unknownStationId: string
}

/**
 * A photo joining an existing debt visit does not change its station — unless it
 * carries a station of its own: one the sender declared for it, or one read off
 * the pump's printed plate. Either always overrides.
 *
 * The rule is complete because inherited guesses cannot disagree with each
 * other: both halves of a pair carry the same submitter, and resolving a station
 * from that is a pure lookup, so both always inherit the same answer. A
 * declaration or a printed plate is the only thing that can introduce
 * divergence — and the two halves of one fill share the declaration too (one
 * caption, or one sender context), which is why a plate never has to be weighed
 * against a declaration made for the OTHER half: the plate-reading half is under
 * the same declaration and is filed as 'declared' itself.
 *
 * Accepted cost: a pump photo arriving late also overrides a station a reviewer
 * picked by hand. Within the pairing window that is rare and the plate is the
 * better answer nearly every time — no provenance column, deliberately.
 */
export function resolveVisitStation({
  visitStationId,
  photoStationId,
  photoStationSource,
  unknownStationId,
}: VisitStationInput): string {
  // A photo that could not place itself never moves the visit.
  if (photoStationId === unknownStationId) return visitStationId
  if (photoStationSource !== 'inherited') return photoStationId
  // Adoption: a visit parked on the unknown station has no answer to keep, so it
  // takes the joining photo's.
  if (visitStationId === unknownStationId) return photoStationId
  return visitStationId
}
