import { describe, expect, it } from 'vitest'

import { Prisma } from '@/lib/generated/prisma/client'
import { computeShiftSales } from '@/lib/inventory/shift-sales'
import {
  isApprovedReading,
  refuseShiftCompletion,
  reversedShiftSales,
} from '@/lib/shifts/completion'
import { vi } from '@/messages/vi'

describe('isApprovedReading', () => {
  it('counts a số liệu the kế toán let through, however it got there', () => {
    expect(isApprovedReading({ reviewStatus: 'approved' })).toBe(true)
    expect(isApprovedReading({ reviewStatus: 'auto_approved' })).toBe(true)
    expect(isApprovedReading({ reviewStatus: 'corrected' })).toBe(true)
  })

  it('counts neither a số liệu chưa duyệt nor one từ chối', () => {
    expect(isApprovedReading({ reviewStatus: 'pending' })).toBe(false)
    expect(isApprovedReading({ reviewStatus: 'needs_review' })).toBe(false)
    expect(isApprovedReading({ reviewStatus: 'rejected' })).toBe(false)
  })
})

describe('refuseShiftCompletion', () => {
  it('chốts a ca whose số liệu are all duyệt', () => {
    expect(
      refuseShiftCompletion([
        { reviewStatus: 'approved' },
        { reviewStatus: 'auto_approved' },
        { reviewStatus: 'corrected' },
      ])
    ).toBeNull()
  })

  it('chốts a ca that has one số liệu đã duyệt beside a từ chối', () => {
    expect(
      refuseShiftCompletion([{ reviewStatus: 'approved' }, { reviewStatus: 'rejected' }])
    ).toBeNull()
  })

  it('refuses a ca that has no số liệu trụ bơm at all', () => {
    expect(refuseShiftCompletion([])).toBe(vi.shifts.cannotCompleteNoReadings)
  })

  // Từ chối leaves the row behind, so a ca whose every số liệu was thrown away still has
  // nothing to trừ kho — the same empty chốt, refused the same way.
  it('refuses a ca whose số liệu were all từ chối', () => {
    expect(refuseShiftCompletion([{ reviewStatus: 'rejected' }])).toBe(
      vi.shifts.cannotCompleteNoReadings
    )
  })

  it('refuses a ca whose số liệu still need duyệt', () => {
    expect(refuseShiftCompletion([{ reviewStatus: 'approved' }, { reviewStatus: 'pending' }])).toBe(
      vi.shifts.cannotCompletePending
    )
    expect(refuseShiftCompletion([{ reviewStatus: 'needs_review' }])).toBe(
      vi.shifts.cannotCompletePending
    )
  })

  // Chưa duyệt is the older refusal and stays the one spoken where both would fire.
  it('speaks the chưa duyệt refusal first when nothing is duyệt either', () => {
    expect(refuseShiftCompletion([{ reviewStatus: 'pending' }])).toBe(
      vi.shifts.cannotCompletePending
    )
  })
})

describe('reversedShiftSales', () => {
  it('reverses posted sales exactly; a second chốt posts only the revised sale', () => {
    const dispenser = [{ id: 'pump', fuelType: 'diesel' }]
    const reading = {
      dispenserId: 'pump',
      fuelType: 'diesel',
      openingElectronicReading: 100,
      electronicReading: 160,
      airPurgeLiters: 5,
    }
    const first = computeShiftSales([reading], dispenser).sales
    const posted = first.map((sale) => ({
      fuelType: sale.fuelType,
      quantity: new Prisma.Decimal(-sale.liters),
    }))
    const reopened = reversedShiftSales(posted)
    const revised = computeShiftSales([{ ...reading, electronicReading: 170 }], dispenser).sales
    const stockBefore = new Prisma.Decimal('1000')
    const stockAfterFirst = stockBefore.plus(posted[0]!.quantity)
    const stockAfterReopen = stockAfterFirst.plus(reopened[0]!.liters)
    const stockAfterSecond = stockAfterReopen.minus(revised[0]!.liters)

    expect(reopened).toEqual([{ fuelType: 'diesel', liters: new Prisma.Decimal('55') }])
    expect(stockAfterReopen.equals(stockBefore)).toBe(true)
    expect(stockAfterSecond.equals(stockBefore.minus('65'))).toBe(true)
  })
})
