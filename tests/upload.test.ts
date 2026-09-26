import { describe, expect, it } from 'vitest'

import { pairHalves, uploadTimestamp } from '@/lib/photos/upload'

describe('pairHalves', () => {
  it('follows the router when it tells the two halves apart', () => {
    expect(pairHalves('vehicle', 'debt_meter')).toEqual(['vehicle', 'debt_meter'])
    expect(pairHalves('debt_meter', 'vehicle')).toEqual(['debt_meter', 'vehicle'])
  })

  it('lets the one half the router is sure of decide', () => {
    expect(pairHalves('electronic_meter', null)).toEqual(['debt_meter', 'vehicle'])
    expect(pairHalves('not_relevant', 'vehicle')).toEqual(['debt_meter', 'vehicle'])
    expect(pairHalves(null, 'mechanical_meter')).toEqual(['vehicle', 'debt_meter'])
  })

  it.each([
    ['debt_meter', 'debt_meter'],
    ['vehicle', 'vehicle'],
    [null, null],
  ] as const)('falls back to upload order, xe first (%s, %s)', (a, b) => {
    expect(pairHalves(a, b)).toEqual(['vehicle', 'debt_meter'])
  })
})

describe('uploadTimestamp', () => {
  // 00:30 on 25/09 in Vietnam, still 24/09 in UTC.
  const now = Date.parse('2026-09-24T17:30:00Z')

  it('stamps today with the upload instant', () => {
    expect(uploadTimestamp('2026-09-25', now)).toBe(now)
  })

  it('stamps an earlier ngày at its last millisecond in Vietnam', () => {
    expect(uploadTimestamp('2026-09-24', now)).toBe(Date.parse('2026-09-24T23:59:59.999+07:00'))
  })

  it.each(['2026-09-26', '2026-02-30', 'hôm nay'])('rejects %s', (day) => {
    expect(uploadTimestamp(day, now)).toBeNull()
  })
})
