import { describe, expect, it } from 'vitest'

import { normalizePlate, plateListContains } from '@/lib/debts/plate'

describe('normalizePlate', () => {
  it('strips separators and uppercases', () => {
    expect(normalizePlate('50E-751.91')).toBe('50E75191')
    expect(normalizePlate('50e 751 91')).toBe('50E75191')
    expect(normalizePlate('51B-12345')).toBe('51B12345')
  })
  it('returns null for empty input', () => {
    expect(normalizePlate(null)).toBeNull()
    expect(normalizePlate('  ')).toBeNull()
    expect(normalizePlate('---')).toBeNull()
  })
})

describe('plateListContains', () => {
  // The real Quang Dũng fleet: one customer, several trucks, mixed formats.
  const known = ['50E-751.91', '50H14324', '50e 657.51']

  it('matches regardless of formatting on either side', () => {
    expect(plateListContains(known, '50E75191')).toBe(true)
    expect(plateListContains(known, '50H-143.24')).toBe(true)
    expect(plateListContains(known, '50E-657.51')).toBe(true)
  })
  it('rejects unknown or empty plates', () => {
    expect(plateListContains(known, '60A-111.11')).toBe(false)
    expect(plateListContains(known, null)).toBe(false)
    expect(plateListContains([], '50E75191')).toBe(false)
  })
})
