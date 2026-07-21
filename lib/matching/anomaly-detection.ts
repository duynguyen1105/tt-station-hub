// Anomaly rules for shift readings (build plan §2.2). Reason codes are stored
// in English; the UI maps them to Vietnamese labels.

export const ANOMALY_REASONS = {
  readingDecreased: 'reading_decreased',
  deltaTooLarge: 'delta_too_large',
  metersDiverge: 'meters_diverge',
  lowConfidence: 'low_confidence',
  missingPhoto: 'missing_photo',
  missingOpening: 'missing_opening',
} as const

export type AnomalyReason = (typeof ANOMALY_REASONS)[keyof typeof ANOMALY_REASONS]

export type AnomalyConfig = {
  // Max plausible liters dispensed between two readings (pilot-tunable).
  maxDeltaLiters: number
  // Allowed divergence (liters) between the electronic and mechanical deltas.
  meterDivergenceTolerance: number
  electronicReviewBelow: number
  mechanicalReviewBelow: number
}

export const DEFAULT_ANOMALY_CONFIG: AnomalyConfig = {
  maxDeltaLiters: 20000,
  meterDivergenceTolerance: 50,
  electronicReviewBelow: 80,
  mechanicalReviewBelow: 70,
}

export type ReadingForAnomaly = {
  electronicReading: number | null
  mechanicalReading: number | null
  openingElectronicReading: number | null
  openingMechanicalReading: number | null
  electronicConfidence: number | null
  mechanicalConfidence: number | null
  hasElectronicMeter: boolean
  hasMechanicalMeter: boolean
  hasElectronicPhoto: boolean
  hasMechanicalPhoto: boolean
}

export type AnomalyResult = {
  isAnomaly: boolean
  reasons: AnomalyReason[]
  electronicDelta: number | null
  mechanicalDelta: number | null
}

/**
 * A meter has a closing reading but no opening to measure it from — a first ca,
 * a replaced meter, or a missed ca. The single source both the anomaly rule and
 * the approval block read, so the two can never disagree. Values are checked for
 * presence only, so a Prisma Decimal row satisfies it as readily as plain numbers.
 */
export function hasMissingOpening(reading: {
  electronicReading: unknown
  openingElectronicReading: unknown
  mechanicalReading: unknown
  openingMechanicalReading: unknown
}): boolean {
  return (
    (reading.electronicReading != null && reading.openingElectronicReading == null) ||
    (reading.mechanicalReading != null && reading.openingMechanicalReading == null)
  )
}

export function detectAnomalies(
  reading: ReadingForAnomaly,
  config: AnomalyConfig = DEFAULT_ANOMALY_CONFIG
): AnomalyResult {
  const reasons = new Set<AnomalyReason>()

  const electronicDelta =
    reading.electronicReading != null && reading.openingElectronicReading != null
      ? reading.electronicReading - reading.openingElectronicReading
      : null
  const mechanicalDelta =
    reading.mechanicalReading != null && reading.openingMechanicalReading != null
      ? reading.mechanicalReading - reading.openingMechanicalReading
      : null

  // Rule 1 + 2: reading decreased / delta too large.
  for (const delta of [electronicDelta, mechanicalDelta]) {
    if (delta == null) continue
    if (delta < 0) reasons.add(ANOMALY_REASONS.readingDecreased)
    else if (delta > config.maxDeltaLiters) reasons.add(ANOMALY_REASONS.deltaTooLarge)
  }

  // Rule 3: the two meters disagree on how much was dispensed.
  if (
    electronicDelta != null &&
    mechanicalDelta != null &&
    Math.abs(electronicDelta - mechanicalDelta) > config.meterDivergenceTolerance
  ) {
    reasons.add(ANOMALY_REASONS.metersDiverge)
  }

  // Rule 4: low AI confidence.
  if (
    reading.hasElectronicMeter &&
    reading.electronicConfidence != null &&
    reading.electronicConfidence < config.electronicReviewBelow
  ) {
    reasons.add(ANOMALY_REASONS.lowConfidence)
  }
  if (
    reading.hasMechanicalMeter &&
    reading.mechanicalConfidence != null &&
    reading.mechanicalConfidence < config.mechanicalReviewBelow
  ) {
    reasons.add(ANOMALY_REASONS.lowConfidence)
  }

  // Rule 5: a meter exists but its photo is missing.
  if (reading.hasElectronicMeter && !reading.hasElectronicPhoto) {
    reasons.add(ANOMALY_REASONS.missingPhoto)
  }
  if (reading.hasMechanicalMeter && !reading.hasMechanicalPhoto) {
    reasons.add(ANOMALY_REASONS.missingPhoto)
  }

  // Rule 6: a meter has a closing reading but no opening to measure from. Left
  // silent, it would book zero liters; flagged, it stops for the accountant.
  if (hasMissingOpening(reading)) {
    reasons.add(ANOMALY_REASONS.missingOpening)
  }

  const reasonList = [...reasons]
  return {
    isAnomaly: reasonList.length > 0,
    reasons: reasonList,
    electronicDelta,
    mechanicalDelta,
  }
}
