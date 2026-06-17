import type { ExtractMeterResult, MeterType } from '@/lib/ai/types'
import fixtures from '@/test-fixtures/expected-extractions.json'

type Fixture = {
  meterType: MeterType
  reading: string | null
  stationLabel: string | null
  dispenserLabel: string | null
  fuelType: string | null
  hasUnreadableDigits?: boolean
  notes?: string
}

const FIXTURES = fixtures as Record<string, Fixture>

export function isAiMockEnabled(): boolean {
  return process.env.AI_MOCK === 'true'
}

/** Simulates AI latency (500-2000ms) so the mock behaves like the real call. */
export function mockDelay(): Promise<void> {
  const ms = 500 + Math.random() * 1500
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Returns the expected extraction for a sample photo key (e.g. "13119").
 * Falls back to the first fixture when no key is provided.
 */
export function lookupMockExtraction(key?: string): ExtractMeterResult {
  const fixture = (key && FIXTURES[key]) || Object.values(FIXTURES)[0]
  if (!fixture) {
    throw new Error('No mock fixtures available in expected-extractions.json')
  }

  return {
    meterType: fixture.meterType,
    reading: fixture.reading,
    stationLabel: fixture.stationLabel,
    dispenserLabel: fixture.dispenserLabel,
    fuelType: fixture.fuelType,
    readingConfidence: 99,
    labelsConfidence: 95,
    hasUnreadableDigits: fixture.hasUnreadableDigits ?? false,
    notes: fixture.notes ?? '',
    raw: { mock: true, key: key ?? null, fixture },
  }
}
