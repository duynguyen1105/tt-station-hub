import { describe, expect, it } from 'vitest'

import {
  dispenserKey,
  matchPhotoToDispenser,
  normalizeLabel,
  pickDispenserByFuel,
} from '@/lib/matching/photo-to-reading'

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

describe('dispenserKey', () => {
  it("strips Vietnamese diacritics — official plates print 'TRỤ'", () => {
    expect(dispenserKey('TRỤ 2')).toBe('TRU_2')
    expect(dispenserKey('TRỤ 2 - XA')).toBe('TRU_2')
    expect(dispenserKey('Trụ 10')).toBe('TRU_10')
  })

  it('extracts TRU_<n>, ignoring fuel/tank suffixes and leading zeros', () => {
    expect(dispenserKey('TRU 4 - DC')).toBe('TRU_4')
    expect(dispenserKey('TRU 04')).toBe('TRU_4')
    // The AI sometimes transcribes the plate without the space (Phúc Tiến TRU4).
    expect(dispenserKey('TRU4')).toBe('TRU_4')
    expect(dispenserKey('TRỤ4 - DC')).toBe('TRU_4')
    expect(dispenserKey('TRU_2')).toBe('TRU_2')
    expect(dispenserKey(null)).toBeNull()
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
  it('matches despite a fuel suffix on the label ("TRU 1 - DO")', () => {
    const result = matchPhotoToDispenser(
      { extractedDispenserCode: 'TRU 1 - DO', meterType: 'mechanical' },
      dispensers
    )
    expect(result).toEqual({ dispenserId: 'd1', slot: 'mechanical', status: 'matched' })
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

describe('pickDispenserByFuel', () => {
  const ure1 = { id: 'ure-1', fuelType: 'URE', lastElectronicReading: 14500 }
  const ure2 = { id: 'ure-2', fuelType: 'URE', lastElectronicReading: 7700 }
  const doPump = { id: 'do-1', fuelType: 'DO', lastElectronicReading: 90000 }

  it('matches a unique same-fuel pump directly', () => {
    expect(pickDispenserByFuel([ure1, doPump], 'URE', 14598.91, new Set())).toBe('ure-1')
  })

  it('tells twin pumps apart by the nearest last total', () => {
    // DakNong1's two URE meters: 14598.910 belongs beside 14500, not 7700.
    expect(pickDispenserByFuel([ure1, ure2, doPump], 'URE', 14598.91, new Set())).toBe('ure-1')
    expect(pickDispenserByFuel([ure1, ure2, doPump], 'URE', 7761.98, new Set())).toBe('ure-2')
  })

  it('falls back to the first free slot when history is incomplete', () => {
    const fresh1 = { ...ure1, lastElectronicReading: null }
    const fresh2 = { ...ure2, lastElectronicReading: null }
    expect(pickDispenserByFuel([fresh1, fresh2], 'URE', 14598.91, new Set())).toBe('ure-1')
    expect(pickDispenserByFuel([fresh1, fresh2], 'URE', 7761.98, new Set(['ure-1']))).toBe('ure-2')
  })

  it('returns null when the station has no pump of that fuel', () => {
    expect(pickDispenserByFuel([doPump], 'URE', 100, new Set())).toBeNull()
  })
})
