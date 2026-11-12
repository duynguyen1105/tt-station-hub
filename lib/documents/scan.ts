// Document scans live at <STATION>/documents/<documentId>[-<random>].<ext>.
// Only files this row's scan-upload path created belong to this document. JSON callers
// can attach arbitrary URLs, which must never become arbitrary storage deletion targets.
export function ownedScan(path: string | null, id: string): path is string {
  if (!path || path.startsWith('/') || path.includes('..') || path.includes('://')) return false
  const filename = path.split('/documents/')[1]
  return (
    !!filename &&
    (filename.startsWith(`${id}.`) || filename.startsWith(`${id}-`)) &&
    !filename.includes('/')
  )
}

/** A browser-uploaded scan path is accepted only inside its own station + document slot. */
export const stationScan = (path: string, stationCode: string, id: string) =>
  path.startsWith(`${stationCode}/documents/`) && ownedScan(path, id)
