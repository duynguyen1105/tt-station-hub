import { describe, expect, it } from 'vitest'

import {
  type ReadingMeters,
  electronicGap,
  mechanicalGap,
  meterGap,
  meterGapDifference,
  readingAmount,
} from '@/lib/shifts/reading-totals'

/** Trụ 1 of the screenshot: đồng hồ điện tử and đồng hồ cơ disagree by 0.24 lít. */
const trụ1: ReadingMeters = {
  openingElectronicReading: 412455.79,
  electronicReading: 414280.55,
  openingMechanicalReading: 565573,
  mechanicalReading: 567398,
}

/** Trụ URE 1: no đồng hồ cơ at all, only the điện tử pair. */
const ureTrụ: ReadingMeters = {
  openingElectronicReading: 9505.74,
  electronicReading: 9561.74,
  openingMechanicalReading: null,
  mechanicalReading: null,
}

describe('meterGap', () => {
  it('subtracts the opening from the closing', () => {
    expect(meterGap(412455.79, 414280.55)).toBe(1824.76)
  })

  it('keeps a trụ that did not move at 0 rather than calling it missing', () => {
    expect(meterGap(19379.236, 19379.236)).toBe(0)
  })

  it('has no answer when either end is missing', () => {
    expect(meterGap(null, 414280.55)).toBeNull()
    expect(meterGap(412455.79, null)).toBeNull()
  })
})

describe('meterGapDifference', () => {
  it('reports how far the two đồng hồ disagree', () => {
    expect(electronicGap(trụ1)).toBe(1824.76)
    expect(mechanicalGap(trụ1)).toBe(1825)
    expect(meterGapDifference(trụ1)).toBe(-0.24)
  })

  it('says nothing when the two agree — the column shows a dash', () => {
    expect(
      meterGapDifference({
        openingElectronicReading: 10003,
        electronicReading: 10070,
        openingMechanicalReading: 10003,
        mechanicalReading: 10070,
      })
    ).toBeNull()
  })

  it('says nothing when there is no đồng hồ cơ to compare against', () => {
    expect(meterGapDifference(ureTrụ)).toBeNull()
  })
})

describe('readingAmount', () => {
  it('prices the đồng hồ điện tử litres, never the cơ ones', () => {
    // 1824.76 lít — the điện tử gap — even though the cơ meter read 1825.
    expect(readingAmount(trụ1, 20000)).toBeCloseTo(36495200, 2)
  })

  it('has no total without a giá bán lẻ for the ca', () => {
    expect(readingAmount(trụ1, null)).toBeNull()
  })

  it('has no total until the trụ has both điện tử ends', () => {
    expect(readingAmount({ ...trụ1, electronicReading: null }, 20000)).toBeNull()
  })
})
