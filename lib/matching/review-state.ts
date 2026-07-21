import { type ConfidenceClass, classifyElectronic, classifyMechanical } from '@/lib/ai/confidence'
import {
  type AnomalyConfig,
  type AnomalyReason,
  DEFAULT_ANOMALY_CONFIG,
  type ReadingForAnomaly,
  detectAnomalies,
} from '@/lib/matching/anomaly-detection'

const SEVERITY: Record<ConfidenceClass, number> = {
  auto_approved: 0,
  pending: 1,
  needs_review: 2,
}

export type ReviewState = {
  isAnomaly: boolean
  anomalyReasons: AnomalyReason[]
  reviewStatus: ConfidenceClass
}

/**
 * Turns a reading's warnings and AI confidence into its review state. Every path
 * that needs a review state derives it here, so that no two can disagree.
 *
 * The confidence cutoffs are encoded twice over: here via the classifier, and
 * again as the anomaly config's `*ReviewBelow` values. The two line up today —
 * change one and the other has to follow.
 */
export function deriveReviewState(
  reading: ReadingForAnomaly,
  config: AnomalyConfig = DEFAULT_ANOMALY_CONFIG
): ReviewState {
  const anomaly = detectAnomalies(reading, config)

  // A slot is classifiable only once it has both a reading and a confidence for
  // it — which is a different question from whether the dispenser has that meter
  // fitted (what the anomaly rules key off).
  const classes: ConfidenceClass[] = []
  if (reading.electronicReading != null && reading.electronicConfidence != null) {
    classes.push(classifyElectronic(reading.electronicConfidence))
  }
  if (reading.mechanicalReading != null && reading.mechanicalConfidence != null) {
    classes.push(classifyMechanical(reading.mechanicalConfidence))
  }
  // Most-severe confidence class across the filled slots; default to
  // needs_review when nothing could be classified.
  const worst = classes.length
    ? classes.reduce((a, b) => (SEVERITY[b] > SEVERITY[a] ? b : a))
    : 'needs_review'

  return {
    isAnomaly: anomaly.isAnomaly,
    anomalyReasons: anomaly.reasons,
    reviewStatus: anomaly.isAnomaly ? 'needs_review' : worst,
  }
}
