import { describe, expect, it } from 'vitest'

import {
  dispenserCodeFor,
  dispenserNameFor,
  tankCodeFor,
  tankNumberFrom,
} from '@/lib/dispensers/naming'
import { tankCodeFromLabel } from '@/lib/imports/bien-ban'
import { dispenserKey } from '@/lib/matching/photo-to-reading'

describe('dispenserNameFor', () => {
  it('names a trụ the way its plate is printed', () => {
    expect(dispenserNameFor(4)).toBe('Trụ 4')
    expect(dispenserNameFor(10)).toBe('Trụ 10')
  })
})

describe('dispenserCodeFor', () => {
  it('codes a trụ as the key its own tên resolves to', () => {
    expect(dispenserCodeFor(4)).toBe('TRU_4')
    expect(dispenserCodeFor(4)).toBe(dispenserKey(dispenserNameFor(4)))
  })

  it('is what a plate read off a photo matches, however the AI transcribes it', () => {
    for (const plate of ['TRỤ 4', 'TRU 4', 'TRU 04', 'TRU4', 'TRỤ4 - DC', 'tru-4']) {
      expect(dispenserKey(plate)).toBe(dispenserCodeFor(4))
    }
  })

  it('keeps a two-digit số trụ whole', () => {
    expect(dispenserCodeFor(10)).toBe('TRU_10')
    expect(dispenserKey('Trụ 10')).toBe(dispenserCodeFor(10))
  })
})

describe('tankCodeFor', () => {
  it('codes a hầm the way a paper biên bản label resolves', () => {
    expect(tankCodeFor(3)).toBe(tankCodeFromLabel('HẦM 3')?.code)
    expect(tankCodeFor(3)).toBe(tankCodeFromLabel('Hầm 03')?.code)
    expect(tankCodeFor(3)).toBe('HAM_3')
  })
})

describe('tankNumberFrom', () => {
  it('reads the số hầm back out of a code', () => {
    expect(tankNumberFrom('HAM_3')).toBe(3)
    expect(tankNumberFrom('HAM_12')).toBe(12)
  })

  it('has no số hầm for a trụ that draws from none', () => {
    expect(tankNumberFrom(null)).toBeNull()
  })

  it('has no số hầm for a code that carries no number', () => {
    expect(tankNumberFrom('HAM_PHU')).toBeNull()
  })
})
