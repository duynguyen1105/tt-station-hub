// Pairs a vehicle photo with its meter photo for a credit fill (build plan §4.2).
// Heuristic: photos sent close together (and as a vehicle/meter pair) belong to
// the same visit. The time window + caption rules are pilot-tunable (§12.4).
//
// This is the batch shape of the pairing rule: a whole list at once, for offline
// repair (scripts/repair-split-debt-visits.ts), where nothing is arriving. The
// arrival path pairs ONE photo at a time under the global pairing lock, because
// photos race — see findOpenHalf in lib/photos/ingest.ts. Two shapes, one rule:
// same submitter, within the window, opposite halves. Submitter is not a field
// here; the caller groups by it first and pairs within each group.
// See docs/adr/0001-pair-debt-photos-by-submitter.md.

export type VisitPhoto = {
  id: string
  kind: 'vehicle' | 'debt_meter'
  receivedAt: number // epoch ms (trusted Zalo receive time, not watermark)
  caption?: string | null
}

export type VisitPair = {
  vehiclePhotoId: string | null
  meterPhotoId: string | null
  caption: string | null
}

/**
 * How far apart two halves of one fill may arrive in the OFFLINE batch shape
 * (pairVisitPhotos, the repair script, the stray sweep). The arrival path no
 * longer pairs across anything like this: see pickOpenHalf.
 */
export const DEBT_PAIR_WINDOW_MS = 5 * 60 * 1000

/**
 * Two photos selected together and sent as ONE Zalo bubble reach the webhook as
 * separate events 80–100 ms apart (13 photos of one album: 1.3 s). Bubbles sent
 * one after another are tens of seconds apart. So "same bubble" is a timestamp
 * gap well under this, and nothing else — Zalo carries no album id.
 */
export const SAME_BUBBLE_MS = 2_000

/**
 * A fill photographed as two separate bubbles (vehicle, then pump) is still one
 * fill when nothing else from the same submitter landed near it.
 */
export const LONE_PAIR_WINDOW_MS = 60_000

export type OpenHalfCandidate = {
  visitDate: Date
  /** Still missing the half that is arriving. */
  open: boolean
}

export type OpenHalfPick<T> = { visit: T | null; ambiguous: boolean }

/**
 * The arrival-path pairing rule, on the submitter's visits that lie within
 * ±LONE_PAIR_WINDOW_MS of the arriving photo's Zalo timestamp (`at`), open or not.
 *
 * 1. An open half from the same bubble (≤ SAME_BUBBLE_MS) wins — nearest first.
 *    Sent together always pairs together, whatever order the AI finishes in.
 * 2. Otherwise the open half is taken only when it is the ONLY visit in the
 *    window: a second visit there means another fill was photographed in the
 *    same minute, and which of the two this photo belongs to is a coin flip.
 * 3. Otherwise nothing pairs; `ambiguous` says a wrong-looking neighbour existed,
 *    so the new visit can be flagged for the reviewer instead of silently split.
 *
 * This is what the 5-minute "most recent open half" rule got wrong: photos of
 * three trucks sent at 19:21 pair by AI finish order, i.e. crosswise.
 */
export function pickOpenHalf<T extends OpenHalfCandidate>(
  visits: readonly T[],
  at: number
): OpenHalfPick<T> {
  const gap = (v: T) => Math.abs(v.visitDate.getTime() - at)
  const inWindow = visits.filter((v) => gap(v) <= LONE_PAIR_WINDOW_MS)
  const open = inWindow.filter((v) => v.open).sort((a, b) => gap(a) - gap(b))
  const nearest = open[0]
  if (nearest && gap(nearest) <= SAME_BUBBLE_MS) return { visit: nearest, ambiguous: false }
  if (nearest && inWindow.length === 1) return { visit: nearest, ambiguous: false }
  return { visit: null, ambiguous: inWindow.length > 0 }
}

export function pairVisitPhotos(
  photos: VisitPhoto[],
  windowMs: number = DEBT_PAIR_WINDOW_MS
): VisitPair[] {
  const sorted = [...photos].sort((a, b) => a.receivedAt - b.receivedAt)
  const used = new Set<string>()
  const pairs: VisitPair[] = []

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i]!
    if (used.has(current.id)) continue

    // Find the nearest unused opposite-kind photo within the time window.
    let partner: VisitPhoto | null = null
    for (let j = i + 1; j < sorted.length; j++) {
      const candidate = sorted[j]!
      if (candidate.receivedAt - current.receivedAt > windowMs) break
      if (used.has(candidate.id)) continue
      if (candidate.kind !== current.kind) {
        partner = candidate
        break
      }
    }

    if (partner) {
      used.add(current.id)
      used.add(partner.id)
      const vehicle = current.kind === 'vehicle' ? current : partner
      const meter = current.kind === 'debt_meter' ? current : partner
      pairs.push({
        vehiclePhotoId: vehicle.id,
        meterPhotoId: meter.id,
        caption: vehicle.caption ?? meter.caption ?? null,
      })
    } else {
      used.add(current.id)
      pairs.push({
        vehiclePhotoId: current.kind === 'vehicle' ? current.id : null,
        meterPhotoId: current.kind === 'debt_meter' ? current.id : null,
        caption: current.caption ?? null,
      })
    }
  }

  return pairs
}
