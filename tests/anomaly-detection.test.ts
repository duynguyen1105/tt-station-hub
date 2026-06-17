import { describe, expect, it } from 'vitest'

import {
  ANOMALY_REASONS,
  type ReadingForAnomaly,
  detectAnomalies,
} from '@/lib/matching/anomaly-detection'

const base: ReadingForAnomaly = {
  electronicReading: 1100,
  mechanicalReading: 1100,
  lastElectronicReading: 1000,
  lastMechanicalReading: 1000,
  electronicConfidence: 98,
  mechanicalConfidence: 90,
  hasElectronicMeter: true,
  hasMechanicalMeter: true,
  hasElectronicPhoto: true,
  hasMechanicalPhoto: true,
}

describe('detectAnomalies', () => {
  it('flags nothing for a clean reading', () => {
    const result = detectAnomalies(base)
    expect(result.isAnomaly).toBe(false)
    expect(result.electronicDelta).toBe(100)
  })
  it('flags a decreased reading', () => {
    const result = detectAnomalies({ ...base, electronicReading: 900 })
    expect(result.reasons).toContain(ANOMALY_REASONS.readingDecreased)
  })
  it('flags an implausibly large delta', () => {
    const result = detectAnomalies({ ...base, electronicReading: 50000 })
    expect(result.reasons).toContain(ANOMALY_REASONS.deltaTooLarge)
  })
  it('flags diverging meters', () => {
    const result = detectAnomalies({ ...base, mechanicalReading: 1500 })
    expect(result.reasons).toContain(ANOMALY_REASONS.metersDiverge)
  })
  it('flags low confidence', () => {
    const result = detectAnomalies({ ...base, electronicConfidence: 50 })
    expect(result.reasons).toContain(ANOMALY_REASONS.lowConfidence)
  })
  it('flags a missing photo', () => {
    const result = detectAnomalies({ ...base, hasMechanicalPhoto: false })
    expect(result.reasons).toContain(ANOMALY_REASONS.missingPhoto)
  })
})
