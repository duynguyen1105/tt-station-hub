// Matches an extracted shift photo to a dispenser + meter slot (build plan §2.2).

export type DispenserRef = { id: string; code: string }

export type PhotoForMatch = {
  extractedDispenserCode: string | null
  meterType: string | null
}

export type MeterSlot = 'electronic' | 'mechanical'

export type MatchResult = {
  dispenserId: string | null
  slot: MeterSlot | null
  status: 'matched' | 'ambiguous' | 'unmatched'
}

/** Normalizes a dispenser label: "TRU 1" / "tru-1" -> "TRU_1". */
export function normalizeLabel(raw: string | null | undefined): string | null {
  if (!raw) return null
  const normalized = raw
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
  return normalized === '' ? null : normalized
}

function slotForMeterType(meterType: string | null): MeterSlot | null {
  if (!meterType) return null
  if (meterType.startsWith('electronic')) return 'electronic'
  if (meterType === 'mechanical') return 'mechanical'
  return null
}

export function matchPhotoToDispenser(
  photo: PhotoForMatch,
  dispensers: DispenserRef[]
): MatchResult {
  const slot = slotForMeterType(photo.meterType)
  const code = normalizeLabel(photo.extractedDispenserCode)
  if (!code) return { dispenserId: null, slot, status: 'unmatched' }

  const matches = dispensers.filter((d) => normalizeLabel(d.code) === code)
  if (matches.length === 1) return { dispenserId: matches[0]!.id, slot, status: 'matched' }
  if (matches.length > 1) return { dispenserId: null, slot, status: 'ambiguous' }
  return { dispenserId: null, slot, status: 'unmatched' }
}
