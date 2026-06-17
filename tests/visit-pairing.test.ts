import { describe, expect, it } from 'vitest'

import { type VisitPhoto, pairVisitPhotos } from '@/lib/matching/visit-pairing'

describe('pairVisitPhotos', () => {
  it('pairs a vehicle and a meter photo sent close together', () => {
    const photos: VisitPhoto[] = [
      { id: 'v1', kind: 'vehicle', receivedAt: 0, caption: 'Xe Tiến Oanh' },
      { id: 'm1', kind: 'debt_meter', receivedAt: 30_000 },
    ]
    const pairs = pairVisitPhotos(photos)
    expect(pairs).toHaveLength(1)
    expect(pairs[0]).toEqual({
      vehiclePhotoId: 'v1',
      meterPhotoId: 'm1',
      caption: 'Xe Tiến Oanh',
    })
  })

  it('leaves a lone meter photo unpaired', () => {
    const pairs = pairVisitPhotos([{ id: 'm1', kind: 'debt_meter', receivedAt: 0 }])
    expect(pairs[0]).toEqual({ vehiclePhotoId: null, meterPhotoId: 'm1', caption: null })
  })

  it('does not pair photos outside the time window', () => {
    const photos: VisitPhoto[] = [
      { id: 'v1', kind: 'vehicle', receivedAt: 0 },
      { id: 'm1', kind: 'debt_meter', receivedAt: 10 * 60 * 1000 },
    ]
    const pairs = pairVisitPhotos(photos)
    expect(pairs).toHaveLength(2)
  })
})
