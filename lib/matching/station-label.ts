import { prisma } from '@/lib/prisma'

export type StationRef = { id: string; code: string }

/**
 * Normalizes a printed station label for matching: strips Vietnamese diacritics
 * (Đ/đ included), uppercases, and drops everything but letters/digits, so
 * "ĐAKNONG 1", "Đắk Nông 1" and the code "DAKNONG1" all collapse to "DAKNONG1".
 */
export function normalizeStationLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

/** Also collapse zero-padded numbers ("NGANHA01" -> "NGANHA1") for label variants. */
export function stripZeroPadding(normalized: string): string {
  return normalized.replace(/0+(\d)/g, '$1')
}

/**
 * Pure matcher: resolves an AI-read station label ("ĐAKNONG 1") to one of the
 * stations by comparing normalized label against normalized code and name.
 * Exact match wins; then a contains match (labels often carry extra words).
 */
export function pickStationByLabel<T extends { id: string; code: string; name: string }>(
  label: string,
  stations: T[]
): T | null {
  const norm = normalizeStationLabel(label)
  if (!norm) return null
  const wanted = new Set([norm, stripZeroPadding(norm)])

  for (const st of stations) {
    const variants = [
      normalizeStationLabel(st.code),
      stripZeroPadding(normalizeStationLabel(st.code)),
      normalizeStationLabel(st.name),
      stripZeroPadding(normalizeStationLabel(st.name)),
    ]
    if (variants.some((v) => v && wanted.has(v))) return st
  }
  for (const st of stations) {
    const code = stripZeroPadding(normalizeStationLabel(st.code))
    const n = stripZeroPadding(norm)
    if (code && (n.includes(code) || code.includes(n))) return st
  }
  return null
}

/** DB-backed wrapper: matches a label against the active stations. */
export async function matchStationByLabel(label: string): Promise<StationRef | null> {
  const stations = await prisma.station.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
  })
  const hit = pickStationByLabel(label, stations)
  return hit ? { id: hit.id, code: hit.code } : null
}

// Kind keywords a typed declaration carries around the station ("chốt ca
// daknong1") — stripped (per normalized word) before the fuzzy comparison.
const DECLARATION_KEYWORDS = new Set(['CHOT', 'CA', 'CONG', 'NO', 'TON', 'KHO', 'KIEM', 'KE', 'XE'])

/** True when the strings are equal up to ONE edit (substitution/insert/delete). */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  if (long.length - short.length > 1) return false
  if (long.length === short.length) {
    let diffs = 0
    for (let i = 0; i < short.length; i++) {
      if (short[i] !== long[i] && ++diffs > 1) return false
    }
    return true
  }
  // Lengths differ by 1: allow a single skipped character in the longer string.
  let i = 0
  let j = 0
  let skipped = false
  while (i < short.length) {
    if (short[i] === long[j]) {
      i++
      j++
    } else if (!skipped) {
      skipped = true
      j++
    } else {
      return false
    }
  }
  return true
}

/**
 * Resolves the station out of a TYPED declaration ("chốt ca daknong1",
 * "dak nông  1"). Human typing is sloppier than a printed plate, so after the
 * exact matcher this tolerates ONE typo in the letters — but the digits must
 * match exactly (DAKNONG1 and DAKNONG2 differ by one character, so a fuzzy
 * match across digits would silently swap stations), and an ambiguous fuzzy
 * hit (two stations within one edit) resolves to nothing rather than a guess.
 */
export function pickStationByDeclaration<T extends { id: string; code: string; name: string }>(
  text: string,
  stations: T[]
): T | null {
  const direct = pickStationByLabel(text, stations)
  if (direct) return direct

  const candidate = stripZeroPadding(
    text
      .split(/\s+/)
      .map((word) => normalizeStationLabel(word))
      .filter((word) => word !== '' && !DECLARATION_KEYWORDS.has(word))
      .join('')
  )
  // Too short to trust a fuzzy hit ("ca 1" must never become a station).
  if (candidate.length < 5) return null

  const digitsOf = (value: string) => value.replace(/[^0-9]/g, '')
  const hits = stations.filter((st) => {
    const code = stripZeroPadding(normalizeStationLabel(st.code))
    return digitsOf(code) === digitsOf(candidate) && withinOneEdit(candidate, code)
  })
  return hits.length === 1 ? hits[0]! : null
}

/** DB-backed wrapper of pickStationByDeclaration over the active stations. */
export async function matchStationByDeclaration(text: string): Promise<StationRef | null> {
  const stations = await prisma.station.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
  })
  const hit = pickStationByDeclaration(text, stations)
  return hit ? { id: hit.id, code: hit.code } : null
}

// Reserved holding station for photos whose station could not be determined —
// inactive so it never shows in pickers/overviews; the reviewer re-assigns the
// visit to a real station via the dropdown on the review card.
export const UNKNOWN_STATION_CODE = 'UNKNOWN'

export async function getOrCreateUnknownStation(): Promise<StationRef> {
  const station = await prisma.station.upsert({
    where: { code: UNKNOWN_STATION_CODE },
    create: { code: UNKNOWN_STATION_CODE, name: 'Chưa xác định trạm', isActive: false },
    update: {},
    select: { id: true, code: true },
  })
  return station
}
