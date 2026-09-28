// Groups ALL matched photos of a shift reading per meter slot, so the review UI
// can show every photo (staff cross-check by shooting the same totalizer twice)
// instead of only the last one that landed in electronic/mechanicalPhotoId.

export type MatchedPhotoRow = {
  id: string
  matchedReadingId: string | null
  meterType: string | null
  extractedReading: { toString(): string } | null
}

export type ReadingPhoto = {
  id: string
  url: string
  // What the AI read on THIS photo — shown with the image so the reviewer can
  // compare diverging duplicates at a glance.
  reading: string | null
}

/** Keep detach decisions and review thumbnails on the same slot classification. */
export function meterSlotForPhoto(
  reading: { electronicPhotoId: string | null; mechanicalPhotoId: string | null },
  photo: Pick<MatchedPhotoRow, 'id' | 'meterType'>
): 'electronic' | 'mechanical' {
  return photo.id === reading.mechanicalPhotoId ||
    (photo.id !== reading.electronicPhotoId && photo.meterType === 'mechanical')
    ? 'mechanical'
    : 'electronic'
}

export function readingPhotosForSlots(
  reading: { id: string; electronicPhotoId: string | null; mechanicalPhotoId: string | null },
  photos: MatchedPhotoRow[],
  urlById: Map<string, string>
): { electronic: ReadingPhoto[]; mechanical: ReadingPhoto[] } {
  const electronic: ReadingPhoto[] = []
  const mechanical: ReadingPhoto[] = []

  for (const photo of photos) {
    if (photo.matchedReadingId !== reading.id) continue
    const url = urlById.get(photo.id)
    if (!url) continue
    const isMechanical = meterSlotForPhoto(reading, photo) === 'mechanical'
    const entry = { id: photo.id, url, reading: photo.extractedReading?.toString() ?? null }
    // The chosen photo (the one backing the stored number) goes first.
    const chosen = photo.id === reading.electronicPhotoId || photo.id === reading.mechanicalPhotoId
    const target = isMechanical ? mechanical : electronic
    if (chosen) target.unshift(entry)
    else target.push(entry)
  }

  return { electronic, mechanical }
}
