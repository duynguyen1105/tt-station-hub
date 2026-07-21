import { describe, expect, it } from 'vitest'

import { computeShiftSales } from '@/lib/inventory/shift-sales'
import {
  ANOMALY_REASONS,
  type ReadingForAnomaly,
  detectAnomalies,
} from '@/lib/matching/anomaly-detection'

// The mechanical opening a real ca measures from is the previous ca's mechanical
// closing, carried forward by the completion step's cache advance — not a value
// hand-set on the fixture. Derive it the way production does so the cross-check is
// exercised against an opening that actually arrived through that path.
function mechanicalOpeningFromPreviousCa(previousMechanicalClosing: number): number {
  const { advances } = computeShiftSales(
    [
      {
        dispenserId: 'd1',
        openingElectronicReading: 1000,
        electronicReading: 1100,
        openingMechanicalReading: 1000,
        mechanicalReading: previousMechanicalClosing,
      },
    ],
    [{ id: 'd1', fuelType: 'DO' }]
  )
  const opening = advances[0]?.newMechanicalReading
  if (opening == null) throw new Error('previous ca did not advance the mechanical cache')
  return opening
}

const base: ReadingForAnomaly = {
  electronicReading: 1100,
  mechanicalReading: 1100,
  openingElectronicReading: 1000,
  openingMechanicalReading: 1000,
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
  it('flags diverging meters against an opening carried forward from the previous ca', () => {
    // The previous ca closed the mechanical meter at 1200; that becomes this ca's
    // mechanical opening via the completion advance. The electronic meter moved +100
    // (1000 -> 1100) while the mechanical moved +400 (1200 -> 1600): 300 apart, well
    // over the 50-liter tolerance.
    const openingMechanicalReading = mechanicalOpeningFromPreviousCa(1200)
    const result = detectAnomalies({
      ...base,
      openingMechanicalReading,
      mechanicalReading: 1600,
    })
    expect(result.reasons).toContain(ANOMALY_REASONS.metersDiverge)
  })

  it('does not flag meters whose divergence is within tolerance', () => {
    // Both openings present; electronic +100, mechanical +130 -> 30 apart, under 50.
    const openingMechanicalReading = mechanicalOpeningFromPreviousCa(1200)
    const result = detectAnomalies({
      ...base,
      openingMechanicalReading,
      mechanicalReading: 1330,
    })
    expect(result.reasons).not.toContain(ANOMALY_REASONS.metersDiverge)
  })
  it('flags low confidence', () => {
    const result = detectAnomalies({ ...base, electronicConfidence: 50 })
    expect(result.reasons).toContain(ANOMALY_REASONS.lowConfidence)
  })
  it('flags a missing photo', () => {
    const result = detectAnomalies({ ...base, hasMechanicalPhoto: false })
    expect(result.reasons).toContain(ANOMALY_REASONS.missingPhoto)
  })
  it('flags a closing reading with no opening, then clears and recomputes liters once it is entered', () => {
    const missing = detectAnomalies({ ...base, openingElectronicReading: null })
    expect(missing.reasons).toContain(ANOMALY_REASONS.missingOpening)
    expect(missing.electronicDelta).toBeNull()
    // Entering the opening clears the flag and the delta (liters) recomputes.
    const fixed = detectAnomalies({ ...base, openingElectronicReading: 1000 })
    expect(fixed.reasons).not.toContain(ANOMALY_REASONS.missingOpening)
    expect(fixed.electronicDelta).toBe(100)
  })
})
