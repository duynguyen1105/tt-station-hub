import { describe, expect, it } from 'vitest'

import { measuredIntakeByTank } from '@/lib/imports/measured-intake'
import { shiftDateFor } from '@/lib/photos/ingest'

describe('the day a phiếu nhập is booked on (shiftDateFor)', () => {
  it('books a midnight GMT+7 delivery on that Vietnamese day, not the UTC day before', () => {
    // NGUYENVUONG: delivered 24/09 00:00 GMT+7 = 23/09 17:00 UTC.
    expect(shiftDateFor(Date.parse('2026-09-24T00:00:00+07:00')).toISOString()).toBe(
      '2026-09-24T00:00:00.000Z'
    )
  })

  it('keeps a late-evening delivery on its own day', () => {
    // LAMDONG01: delivered 23/09 21:40 GMT+7.
    expect(shiftDateFor(Date.parse('2026-09-23T21:40:00+07:00')).toISOString()).toBe(
      '2026-09-23T00:00:00.000Z'
    )
  })
})

describe('measuredIntakeByTank', () => {
  it('reads SL barem sau − trước per hầm from a saved biên bản', () => {
    const checks = [
      { tankCode: 'HAM_1', before: { baremLiters: 2494 }, after: { baremLiters: 6414 } },
      { tankCode: 'HAM_2', before: { baremLiters: null }, after: { baremLiters: null } },
      { tankCode: 'HAM_5', before: { baremLiters: 1496 }, after: { baremLiters: 7487 } },
    ]
    expect([...measuredIntakeByTank(checks)]).toEqual([
      ['HAM_1', 3920],
      ['HAM_5', 5991],
    ])
  })

  it('reads nothing from a malformed or missing section', () => {
    expect(measuredIntakeByTank(null).size).toBe(0)
    expect(measuredIntakeByTank('garbage').size).toBe(0)
  })
})
