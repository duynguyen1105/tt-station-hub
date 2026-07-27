// The one rule for which station a debt visit keeps when a photo joins it.
// See docs/adr/0001-pair-debt-photos-by-submitter.md — read it before changing
// this: the inverse (letting a joining vehicle photo write its own station) reads
// like harmless symmetry and is what splits pairs across two stations.

export type VisitStationInput = {
  /** The station of the debt visit the photo is joining. */
  visitStationId: string
  /** The station the joining photo resolved for itself. */
  photoStationId: string
  /**
   * True only when the photo's station was read off the pump's printed plate —
   * never the vehicle's number plate, which names a customer and not a station.
   */
  stationFromPumpPlate: boolean
  /** The reserved holding station for photos whose station is undetermined. */
  unknownStationId: string
}

/**
 * A photo joining an existing debt visit does not change its station — unless it
 * is a pump photo that read a station off its printed plate, which always
 * overrides.
 *
 * The rule is complete because sender-derived guesses cannot disagree with each
 * other: both halves of a pair carry the same submitter, and resolving a station
 * from that is a pure lookup, so both always inherit the same answer. A printed
 * plate is the only thing that can introduce divergence.
 *
 * Accepted cost: a pump photo arriving late also overrides a station a reviewer
 * picked by hand. Within the pairing window that is rare and the plate is the
 * better answer nearly every time — no provenance column, deliberately.
 */
export function resolveVisitStation({
  visitStationId,
  photoStationId,
  stationFromPumpPlate,
  unknownStationId,
}: VisitStationInput): string {
  // A photo that could not place itself never moves the visit.
  if (photoStationId === unknownStationId) return visitStationId
  if (stationFromPumpPlate) return photoStationId
  // Adoption: a visit parked on the unknown station has no answer to keep, so it
  // takes the joining photo's.
  if (visitStationId === unknownStationId) return photoStationId
  return visitStationId
}
