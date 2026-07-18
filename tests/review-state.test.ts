import { describe, expect, it } from 'vitest'

import { ANOMALY_REASONS, type ReadingForAnomaly } from '@/lib/matching/anomaly-detection'
import { deriveReviewState } from '@/lib/matching/review-state'

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

describe('deriveReviewState', () => {
  it('auto-approves a clean, confidently-read reading', () => {
    const result = deriveReviewState(base)
    expect(result.reviewStatus).toBe('auto_approved')
    expect(result.isAnomaly).toBe(false)
    expect(result.anomalyReasons).toEqual([])
  })

  // 75 is "pending" to the classifier but still above the anomaly rule's
  // mechanicalReviewBelow (70), so no warning fires and the most-severe class
  // across the two slots is what decides the status on its own.
  it('takes the most severe confidence class across the filled slots', () => {
    const result = deriveReviewState({ ...base, mechanicalConfidence: 75 })
    expect(result.reviewStatus).toBe('pending')
    expect(result.isAnomaly).toBe(false)
  })

  it('forces needs_review when a warning fires, however confident the read', () => {
    const result = deriveReviewState({ ...base, electronicReading: 900 })
    expect(result.reviewStatus).toBe('needs_review')
    expect(result.isAnomaly).toBe(true)
    expect(result.anomalyReasons).toContain(ANOMALY_REASONS.readingDecreased)
  })

  // 50 is under the classifier's cutoff and under the anomaly rule's alike, so
  // this rides the anomaly path to the same answer. The two can't be pulled
  // apart while both thresholds sit on 80.
  it('sends a low-confidence read to review', () => {
    const result = deriveReviewState({ ...base, electronicConfidence: 50 })
    expect(result.reviewStatus).toBe('needs_review')
    expect(result.anomalyReasons).toContain(ANOMALY_REASONS.lowConfidence)
  })

  it('defaults to needs_review when no slot can be classified', () => {
    const result = deriveReviewState({
      ...base,
      electronicReading: null,
      mechanicalReading: null,
      electronicConfidence: null,
      mechanicalConfidence: null,
      hasElectronicMeter: false,
      hasMechanicalMeter: false,
      hasElectronicPhoto: false,
      hasMechanicalPhoto: false,
    })
    expect(result.reviewStatus).toBe('needs_review')
    // Nothing is wrong with the reading — it just cannot be judged.
    expect(result.isAnomaly).toBe(false)
  })

  it('carries the deltas through for the ingest to persist', () => {
    const result = deriveReviewState(base)
    expect(result.electronicDelta).toBe(100)
    expect(result.mechanicalDelta).toBe(100)
  })
})
