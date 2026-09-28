import { type MatchedPhotoRow, meterSlotForPhoto } from '@/lib/photos/reading-photos'

type SlotReading = {
  id: string
  electronicPhotoId: string | null
  mechanicalPhotoId: string | null
}

/** A holder owns the whole meter slot; a cross-check only owns its own match. */
export function planDetachShiftPhoto(
  reading: SlotReading,
  photos: Pick<MatchedPhotoRow, 'id' | 'matchedReadingId' | 'meterType'>[],
  photoId: string
): {
  slot: 'electronic' | 'mechanical'
  unmatchedIds: string[]
  dropDuplicateFlag: boolean
} | null {
  const photo = photos.find((p) => p.id === photoId && p.matchedReadingId === reading.id)
  if (!photo) return null
  const slot = meterSlotForPhoto(reading, photo)
  const holderId = slot === 'electronic' ? reading.electronicPhotoId : reading.mechanicalPhotoId
  const unmatchedIds: string[] = []
  let remainingCrossCheck = false
  for (const matched of photos) {
    if (matched.matchedReadingId !== reading.id || meterSlotForPhoto(reading, matched) !== slot) {
      continue
    }
    if (photoId === holderId) unmatchedIds.push(matched.id)
    else if (matched.id !== photoId && matched.id !== holderId) remainingCrossCheck = true
  }
  return {
    slot,
    unmatchedIds: photoId === holderId ? unmatchedIds : [photoId],
    dropDuplicateFlag: photoId !== holderId && !remainingCrossCheck,
  }
}
