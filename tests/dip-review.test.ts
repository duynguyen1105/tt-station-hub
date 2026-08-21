import { describe, expect, it } from 'vitest'

import {
  REJECTED_DIP,
  canCorrectTankDip,
  canReviewTankDip,
  countableDipWhere,
} from '@/lib/inventory/dip-review'

describe('canReviewTankDip', () => {
  it('lets admin and kế toán decide on a số đo bồn', () => {
    expect(canReviewTankDip('admin')).toBe(true)
    expect(canReviewTankDip('accountant')).toBe(true)
  })

  it('never lets a viewer decide', () => {
    expect(canReviewTankDip('viewer')).toBe(false)
  })

  // The contrast with canReviewShift, which closes to kế toán once the ca is
  // chốt: a đo hầm belongs to no ca, so nothing ever closes the decision. A
  // misread dip-stick spotted weeks later must still be rejectable.
  it('takes no ca status — a chốt ca never closes the decision', () => {
    expect(canReviewTankDip).toHaveLength(1)
  })
})

describe('countableDipWhere', () => {
  it('scopes to the trạm and drops only the từ chối reads', () => {
    expect(countableDipWhere('tram-1')).toEqual({
      stationId: 'tram-1',
      reviewStatus: { not: REJECTED_DIP },
    })
  })

  // A chờ duyệt dip is the newest thing anyone knows about the hầm. Excluding it
  // would leave Tổng quan showing yesterday's tồn thực tế until someone clicks.
  it('keeps a chờ duyệt dip counting as tồn thực tế', () => {
    const { reviewStatus } = countableDipWhere('tram-1')
    expect(reviewStatus.not).not.toBe('pending')
    expect(reviewStatus.not).not.toBe('approved')
  })
})

describe('canCorrectTankDip', () => {
  it('lets a người duyệt repair a chờ xử lý số đo', () => {
    expect(canCorrectTankDip('admin', 'pending')).toBe(true)
    expect(canCorrectTankDip('accountant', 'pending')).toBe(true)
  })

  // The one place a status DOES gate a đo hầm, unlike duyệt / từ chối. The số đo
  // is the fact the decision was made on: moving it afterwards would change what
  // the hầm's tồn thực tế and Quy ra lít say without anyone approving the new
  // number. A genuinely misread dip is từ chối instead.
  it('freezes the số đo once someone has decided, even for an admin', () => {
    expect(canCorrectTankDip('admin', 'approved')).toBe(false)
    expect(canCorrectTankDip('admin', 'rejected')).toBe(false)
    expect(canCorrectTankDip('accountant', 'approved')).toBe(false)
  })

  it('never lets a viewer retype a số đo, at any status', () => {
    expect(canCorrectTankDip('viewer', 'pending')).toBe(false)
    expect(canCorrectTankDip('viewer', 'approved')).toBe(false)
  })
})
