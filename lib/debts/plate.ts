// License plates arrive in many formats — the AI reads "50E-751.91", a human
// types "50E 751.91" or "50e75191" — so every comparison happens on the bare
// alphanumeric form. Storage keeps whatever was written (nicer to read); only
// matching normalizes.

export function normalizePlate(raw: string | null | undefined): string | null {
  if (!raw) return null
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return cleaned === '' ? null : cleaned
}

export function plateListContains(
  knownPlates: string[],
  plate: string | null | undefined
): boolean {
  const wanted = normalizePlate(plate)
  if (!wanted) return false
  return knownPlates.some((known) => normalizePlate(known) === wanted)
}
