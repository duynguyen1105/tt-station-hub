import { describe, expect, it } from 'vitest'

import { matchPhotoToDispenser, normalizeLabel } from '@/lib/matching/photo-to-reading'

const dispensers = [
  { id: 'd1', code: 'TRU_1' },
  { id: 'd2', code: 'TRU_2' },
]

describe('normalizeLabel', () => {
  it('normalizes spacing and case', () => {
    expect(normalizeLabel('TRU 1')).toBe('TRU_1')
    expect(normalizeLabel('tru-2')).toBe('TRU_2')
    expect(normalizeLabel(null)).toBeNull()
  })
})

describe('matchPhotoToDispenser', () => {
  it('matches an electronic photo to its dispenser', () => {
    const result = matchPhotoToDispenser(
      { extractedDispenserCode: 'TRU 1', meterType: 'electronic_montech' },
      dispensers
    )
    expect(result).toEqual({ dispenserId: 'd1', slot: 'electronic', status: 'matched' })
  })
  it('assigns the mechanical slot', () => {
    const result = matchPhotoToDispenser(
      { extractedDispenserCode: 'TRU_2', meterType: 'mechanical' },
      dispensers
    )
    expect(result.slot).toBe('mechanical')
    expect(result.dispenserId).toBe('d2')
  })
  it('returns unmatched when the code is unknown or missing', () => {
    expect(
      matchPhotoToDispenser(
        { extractedDispenserCode: 'TRU 9', meterType: 'mechanical' },
        dispensers
      ).status
    ).toBe('unmatched')
    expect(
      matchPhotoToDispenser({ extractedDispenserCode: null, meterType: 'mechanical' }, dispensers)
        .status
    ).toBe('unmatched')
  })
})
