import { describe, expect, it } from 'vitest'

import { parsePhotoDate } from '@/lib/ai/extract-visit'
import { photoDateFlag, photoDateMismatch } from '@/lib/photos/ingest'

describe('printed photo dates', () => {
  it('normalizes supported formats and rejects impossible dates', () => {
    expect(parsePhotoDate('26/09/2026')).toBe('2026-09-26')
    expect(parsePhotoDate('26-09-2026')).toBe('2026-09-26')
    expect(parsePhotoDate('26/09/26')).toBe('2026-09-26')
    expect(parsePhotoDate('2026-09-26')).toBe('2026-09-26')
    expect(parsePhotoDate('29/02/2024')).toBe('2024-02-29')
    expect(parsePhotoDate('29/02/2026')).toBeNull()
    expect(parsePhotoDate('31/04/2026')).toBeNull()
    expect(parsePhotoDate('26/13/2026')).toBeNull()
    expect(parsePhotoDate('26/09/2026 18:32')).toBeNull()
    expect(parsePhotoDate(null)).toBeNull()
  })

  it('compares to the GMT+7 visit day without moving the visit itself', () => {
    const visit = new Date('2026-09-26T18:00:00Z') // 27/09 in Vietnam
    expect(photoDateMismatch('2026-09-27', visit)).toBe(false)
    expect(photoDateMismatch('2026-09-26', visit)).toBe(true)
    expect(photoDateMismatch(null, visit)).toBe(false)
    expect(visit.toISOString()).toBe('2026-09-26T18:00:00.000Z')
  })

  it('sends a clean meter read with a mismatched ngày to needs_review, keeping its anomalies', () => {
    const clean = { reviewStatus: 'pending', anomalyReasons: [] as string[] }
    expect({ ...clean, ...photoDateFlag(clean.anomalyReasons, true) }).toEqual({
      reviewStatus: 'needs_review',
      anomalyReasons: ['photo_date_mismatch'],
    })
    expect(photoDateFlag(['price_mismatch'], true).anomalyReasons).toEqual([
      'price_mismatch',
      'photo_date_mismatch',
    ])
    expect({ ...clean, ...photoDateFlag([], false) }).toEqual(clean)
  })
})
