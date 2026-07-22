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
function stripZeroPadding(normalized: string): string {
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
