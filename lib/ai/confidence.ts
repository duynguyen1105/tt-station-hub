// Confidence thresholds from the build plan (§5.7). The classification decides
// whether a reading can be auto-approved or must go to the review queue.

export type ConfidenceClass = 'auto_approved' | 'pending' | 'needs_review'

function classify(confidence: number, autoMin: number, pendingMin: number): ConfidenceClass {
  if (confidence >= autoMin) return 'auto_approved'
  if (confidence >= pendingMin) return 'pending'
  return 'needs_review'
}

// Electronic shift meter: >=95 auto | 80-94 pending | <80 review.
export function classifyElectronic(confidence: number): ConfidenceClass {
  return classify(confidence, 95, 80)
}

// Mechanical shift meter: >=85 auto | 70-84 pending | <70 review.
export function classifyMechanical(confidence: number): ConfidenceClass {
  return classify(confidence, 85, 70)
}

// Per-trip debt (liters + unit price): >=95 auto | 80-94 pending | <80 review.
export function classifyDebt(confidence: number): ConfidenceClass {
  return classify(confidence, 95, 80)
}
