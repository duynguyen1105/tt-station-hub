import { describe, expect, it } from 'vitest'

import { type VisitPhoto, pairVisitPhotos, pickOpenHalf } from '@/lib/matching/visit-pairing'

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

  it('leaves a lone vehicle photo as a half-pair, not as nothing', () => {
    const pairs = pairVisitPhotos([{ id: 'v1', kind: 'vehicle', receivedAt: 0 }])
    expect(pairs).toEqual([{ vehiclePhotoId: 'v1', meterPhotoId: null, caption: null }])
  })

  it('returns the odd photo out as a half-pair alongside the pair it could form', () => {
    const photos: VisitPhoto[] = [
      { id: 'v1', kind: 'vehicle', receivedAt: 0 },
      { id: 'm1', kind: 'debt_meter', receivedAt: 5_000 },
      { id: 'm2', kind: 'debt_meter', receivedAt: 10_000 },
    ]
    const pairs = pairVisitPhotos(photos)
    expect(pairs).toEqual([
      { vehiclePhotoId: 'v1', meterPhotoId: 'm1', caption: null },
      { vehiclePhotoId: null, meterPhotoId: 'm2', caption: null },
    ])
  })

  it('does not pair photos outside the time window', () => {
    const photos: VisitPhoto[] = [
      { id: 'v1', kind: 'vehicle', receivedAt: 0 },
      { id: 'm1', kind: 'debt_meter', receivedAt: 10 * 60 * 1000 },
    ]
    const pairs = pairVisitPhotos(photos)
    expect(pairs).toHaveLength(2)
  })

  // The window's only remaining job under the submitter key: one submitter's two
  // DIFFERENT fills, both inside the window, must not merge across each other.
  it('keeps two fills by one submitter inside the window as two separate pairs', () => {
    const photos: VisitPhoto[] = [
      { id: 'v1', kind: 'vehicle', receivedAt: 0, caption: 'Xe Tiến Oanh' },
      { id: 'm1', kind: 'debt_meter', receivedAt: 4_000 },
      { id: 'v2', kind: 'vehicle', receivedAt: 90_000, caption: 'Xe anh Ba' },
      { id: 'm2', kind: 'debt_meter', receivedAt: 94_000 },
    ]
    const pairs = pairVisitPhotos(photos)
    expect(pairs).toEqual([
      { vehiclePhotoId: 'v1', meterPhotoId: 'm1', caption: 'Xe Tiến Oanh' },
      { vehiclePhotoId: 'v2', meterPhotoId: 'm2', caption: 'Xe anh Ba' },
    ])
  })

  it('pairs a fill sent pump-photo-first the same way', () => {
    const photos: VisitPhoto[] = [
      { id: 'm1', kind: 'debt_meter', receivedAt: 0 },
      { id: 'v1', kind: 'vehicle', receivedAt: 5, caption: 'Xe Tiến Oanh' },
    ]
    const pairs = pairVisitPhotos(photos)
    expect(pairs).toEqual([{ vehiclePhotoId: 'v1', meterPhotoId: 'm1', caption: 'Xe Tiến Oanh' }])
  })
})

// Timings are the ones Zalo actually delivered on 13/09: the two photos of one
// bubble 80–100 ms apart, the next bubble 48 s later.
describe('pickOpenHalf', () => {
  const half = (id: string, at: number, open = true) => ({ id, visitDate: new Date(at), open })

  it('pairs the half sent in the same bubble, whichever finished AI first', () => {
    const picked = pickOpenHalf([half('A', 0), half('B', 48_000)], 94)
    expect(picked).toEqual({ visit: half('A', 0), ambiguous: false })
  })

  it('pairs three trucks sent at 19:21 to their own bubbles, not crosswise', () => {
    const visits = [half('A', 0), half('B', 30_000), half('C', 55_000)]
    expect(pickOpenHalf(visits, 30_090).visit?.id).toBe('B')
    expect(pickOpenHalf(visits, 55_080).visit?.id).toBe('C')
    expect(pickOpenHalf(visits, 80).visit?.id).toBe('A')
  })

  it('pairs a fill sent as two bubbles when nothing else is near', () => {
    expect(pickOpenHalf([half('A', 0)], 30_000)).toEqual({ visit: half('A', 0), ambiguous: false })
  })

  it('refuses to guess between two fills photographed in the same minute', () => {
    const visits = [half('A', 0), half('B', 50_000)]
    expect(pickOpenHalf(visits, 30_000)).toEqual({ visit: null, ambiguous: true })
  })

  it('refuses when the only neighbour is a fill already complete', () => {
    expect(pickOpenHalf([half('A', 0), half('B', 40_000, false)], 30_000)).toEqual({
      visit: null,
      ambiguous: true,
    })
  })

  it('opens a fresh visit, unflagged, when the sender has nothing nearby', () => {
    expect(pickOpenHalf([half('A', -5 * 60_000)], 0)).toEqual({ visit: null, ambiguous: false })
  })
})
