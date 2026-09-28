import { describe, expect, it } from 'vitest'

import { planDetachShiftPhoto } from '@/lib/photos/detach-shift-photo'
import { type MatchedPhotoRow } from '@/lib/photos/reading-photos'

const reading = { id: 'row', electronicPhotoId: 'e1', mechanicalPhotoId: 'm1' }
const photos: MatchedPhotoRow[] = [
  { id: 'e1', matchedReadingId: 'row', meterType: 'electronic_montech', extractedReading: null },
  { id: 'e2', matchedReadingId: 'row', meterType: 'electronic_lungbor', extractedReading: null },
  { id: 'm1', matchedReadingId: 'row', meterType: 'mechanical', extractedReading: null },
  { id: 'm2', matchedReadingId: 'row', meterType: 'mechanical', extractedReading: null },
]

describe('planDetachShiftPhoto', () => {
  it('empties the electronic holder and returns its cross-check, not the mechanical pair', () => {
    expect(planDetachShiftPhoto(reading, photos, 'e1')).toEqual({
      slot: 'electronic',
      unmatchedIds: ['e1', 'e2'],
      dropDuplicateFlag: false,
    })
  })

  it('unmatches only a losing duplicate and drops the mismatch when it was the last', () => {
    expect(planDetachShiftPhoto(reading, photos, 'e2')).toEqual({
      slot: 'electronic',
      unmatchedIds: ['e2'],
      dropDuplicateFlag: true,
    })
    expect(
      planDetachShiftPhoto(reading, [...photos, { ...photos[1]!, id: 'e3' }], 'e2')
        ?.dropDuplicateFlag
    ).toBe(false)
  })

  it('empties the mechanical holder and returns only mechanical cross-checks', () => {
    expect(
      planDetachShiftPhoto(
        reading,
        photos.map((p) => (p.id === 'm1' ? { ...p, meterType: 'electronic_montech' } : p)),
        'm1'
      )
    ).toEqual({
      slot: 'mechanical',
      unmatchedIds: ['m1', 'm2'],
      dropDuplicateFlag: false,
    })
  })

  it('cannot detach an unrelated photo from this row', () => {
    expect(planDetachShiftPhoto(reading, photos, 'elsewhere')).toBeNull()
  })
})
