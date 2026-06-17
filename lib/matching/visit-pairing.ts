// Pairs a vehicle photo with its meter photo for a credit fill (build plan §4.2).
// Heuristic: photos sent close together (and as a vehicle/meter pair) belong to
// the same visit. The time window + caption rules are pilot-tunable (§12.4).

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

const DEFAULT_WINDOW_MS = 5 * 60 * 1000

export function pairVisitPhotos(
  photos: VisitPhoto[],
  windowMs: number = DEFAULT_WINDOW_MS
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
