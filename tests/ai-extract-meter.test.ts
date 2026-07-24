import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { parseJsonFromText } from '@/lib/ai/claude-vision'
import { classifyElectronic, classifyMechanical } from '@/lib/ai/confidence'
import { extractMeter } from '@/lib/ai/extract-meter'
import { lookupMockExtraction } from '@/lib/ai/mock'
import { electronicSchema, mechanicalSchema, routerSchema } from '@/lib/ai/types'
import expected from '@/test-fixtures/expected-extractions.json'

describe('parseJsonFromText', () => {
  it('parses a fenced ```json block', () => {
    const text =
      'Here is the result:\n```json\n{"image_type":"electronic_meter","confidence":98}\n```'
    expect(parseJsonFromText<{ confidence: number }>(text).confidence).toBe(98)
  })
  it('parses raw JSON with surrounding prose', () => {
    const text = 'noise {"reading":"00123"} trailing'
    expect(parseJsonFromText<{ reading: string }>(text).reading).toBe('00123')
  })
})

describe('zod schemas', () => {
  it('validates a router response', () => {
    const r = routerSchema.parse({ image_type: 'mechanical_meter', confidence: 88 })
    expect(r.image_type).toBe('mechanical_meter')
  })
  it('validates electronic + mechanical responses', () => {
    expect(
      electronicSchema.parse({
        meter_type: 'electronic_montech',
        reading: '30256194',
        confidence: { reading: 97, labels: 90 },
      }).reading
    ).toBe('30256194')
    expect(
      mechanicalSchema.parse({
        meter_type: 'mechanical',
        reading: '0213277',
        confidence: { reading: 80, labels: 60 },
      }).has_unreadable_digits
    ).toBe(false)
  })
})

describe('confidence thresholds (§5.7)', () => {
  it('classifies electronic readings', () => {
    expect(classifyElectronic(96)).toBe('auto_approved')
    expect(classifyElectronic(85)).toBe('pending')
    expect(classifyElectronic(70)).toBe('needs_review')
  })
  it('classifies mechanical readings', () => {
    expect(classifyMechanical(86)).toBe('auto_approved')
    expect(classifyMechanical(75)).toBe('pending')
    expect(classifyMechanical(60)).toBe('needs_review')
  })
})

describe('mock extraction fixtures', () => {
  it('has all 13 sample photos and preserves leading zeros', () => {
    const keys = Object.keys(expected)
    expect(keys).toHaveLength(13)
    expect(lookupMockExtraction('13126').reading).toBe('0213277')
    expect(lookupMockExtraction('13128').reading).toBe('010003')
    expect(lookupMockExtraction('13133').meterType).toBe('electronic_lungbor')
  })
})

describe('extractMeter in AI_MOCK mode', () => {
  beforeEach(() => {
    process.env.AI_MOCK = 'true'
  })
  afterEach(() => {
    delete process.env.AI_MOCK
  })
  it('returns the fixture for a given key without calling the API', async () => {
    const result = await extractMeter({ mockKey: '13120' })
    expect(result.meterType).toBe('electronic_montech')
    expect(result.reading).toBe('30256194')
    expect(result.dispenserLabel).toBe('TRU 1')
  })
})
