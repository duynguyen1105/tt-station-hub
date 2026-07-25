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

/**
 * Normalizes a dispenser label: "TRU 1" / "tru-1" / "TRỤ 1" -> "TRU_1".
 * Vietnamese diacritics are stripped (the official plates print "TRỤ") so the
 * label always compares against the ASCII dispenser codes.
 */
export function normalizeLabel(raw: string | null | undefined): string | null {
  if (!raw) return null
  const normalized = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
  return normalized === '' ? null : normalized
}

/**
 * Canonical key for matching a dispenser: extracts "TRU_<n>" from a label,
 * ignoring fuel/tank suffixes and leading zeros ("TRU 4 - DC" -> "TRU_4",
 * "TRU 04" -> "TRU_4"). The separator is optional because the AI sometimes
 * transcribes the plate without the space ("TRU4" / "TRỤ4"). Falls back to the
 * fully-normalized label when there is no TRU+number pattern, so non-standard
 * codes still compare consistently.
 */
export function dispenserKey(raw: string | null | undefined): string | null {
  const normalized = normalizeLabel(raw)
  if (!normalized) return null
  const match = normalized.match(/TRU_?0*(\d+)/)
  return match ? `TRU_${match[1]}` : normalized
}

function slotForMeterType(meterType: string | null): MeterSlot | null {
  if (!meterType) return null
  if (meterType.startsWith('electronic')) return 'electronic'
  if (meterType === 'mechanical') return 'mechanical'
  return null
}

/**
 * Fuel-based fallback for photos with NO dispenser label (e.g. DakNong1's URE
 * pumps are stickered just "URE"). A unique same-fuel pump matches directly;
 * among several, the one whose last electronic total is nearest wins (a
 * totalizer only creeps upward, so consecutive days stay close); with no
 * history yet, the first pump whose slot is still free this shift takes it.
 */
export function pickDispenserByFuel(
  dispensers: { id: string; fuelType: string; lastElectronicReading: number | null }[],
  fuelType: string,
  reading: number | null,
  occupiedIds: Set<string>
): string | null {
  const wanted = fuelType.trim().toUpperCase()
  const candidates = dispensers.filter((d) => d.fuelType.trim().toUpperCase() === wanted)
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]!.id

  if (reading !== null && candidates.every((d) => d.lastElectronicReading !== null)) {
    let best = candidates[0]!
    for (const d of candidates) {
      if (
        Math.abs(reading - d.lastElectronicReading!) <
        Math.abs(reading - best.lastElectronicReading!)
      ) {
        best = d
      }
    }
    return best.id
  }

  return candidates.find((d) => !occupiedIds.has(d.id))?.id ?? null
}

export function matchPhotoToDispenser(
  photo: PhotoForMatch,
  dispensers: DispenserRef[]
): MatchResult {
  const slot = slotForMeterType(photo.meterType)
  const code = dispenserKey(photo.extractedDispenserCode)
  if (!code) return { dispenserId: null, slot, status: 'unmatched' }

  const matches = dispensers.filter((d) => dispenserKey(d.code) === code)
  if (matches.length === 1) {
    // A known dispenser but no usable meter type (e.g. a display brand the
    // extractor was never taught): the reading has no slot to land in, so
    // reporting 'matched' would hide the photo as if it were fully processed.
    return { dispenserId: matches[0]!.id, slot, status: slot ? 'matched' : 'ambiguous' }
  }
  if (matches.length > 1) return { dispenserId: null, slot, status: 'ambiguous' }
  return { dispenserId: null, slot, status: 'unmatched' }
}
