// Who handed a photo to the system, as one value both intake doors can produce.
// This is the debt pairing key — see docs/adr/0001-pair-debt-photos-by-submitter.md.

/** The two doors into the pipeline: a Zalo send, or a signed-in upload in the app. */
export type SubmitterDoor = 'zalo' | 'app'

/**
 * Namespaces the submitter's id by the door it came through, so a Zalo user id
 * can never collide with an application user id.
 *
 * A photo with no identifiable submitter gets no key at all rather than a shared
 * empty one: an absent submitter must never pair with another absent submitter.
 */
export function submitterKey(door: SubmitterDoor, id: string | null | undefined): string | null {
  const trimmed = id?.trim()
  return trimmed ? `${door}:${trimmed}` : null
}
