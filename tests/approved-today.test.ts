import { describe, expect, it } from 'vitest'

import {
  type ApprovedVisitInput,
  type ShiftDayInput,
  approvedTodaySelection,
  buildApprovedTodayList,
} from '@/lib/debts/approved-today'

const STATION_A = 'aaaaaaaa-0000-0000-0000-000000000001'
const STATION_B = 'bbbbbbbb-0000-0000-0000-000000000002'

/** A shiftDate as stored: UTC midnight labelled with the Vietnam calendar day. */
function day(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

function reviewedWindow(now: Date): { gte: Date; lt: Date } {
  const where = approvedTodaySelection([STATION_A], now).where as {
    reviewedAt: { gte: Date; lt: Date }
  }
  return where.reviewedAt
}

describe('approvedTodaySelection', () => {
  it('spans the GMT+7 day the moment falls in, not the UTC one', () => {
    // 09:00 on 20/08 in Vietnam — UTC still says 02:00 on 20/08.
    const { gte, lt } = reviewedWindow(new Date('2026-08-20T02:00:00.000Z'))
    // The Vietnam day runs 17:00 UTC on 19/08 → 17:00 UTC on 20/08.
    expect(gte.toISOString()).toBe('2026-08-19T17:00:00.000Z')
    expect(lt.toISOString()).toBe('2026-08-20T17:00:00.000Z')
  })

  it('keeps a late-evening duyệt on the day the trạm calls it', () => {
    // 23:30 on 20/08 in Vietnam, though UTC already reads 16:30.
    const { gte, lt } = reviewedWindow(new Date('2026-08-20T16:30:00.000Z'))
    expect(gte.toISOString()).toBe('2026-08-19T17:00:00.000Z')
    expect(lt.toISOString()).toBe('2026-08-20T17:00:00.000Z')
  })

  it('rolls a duyệt past Vietnam midnight onto the next day', () => {
    // 00:30 on 21/08 in Vietnam, though UTC says 17:30 on 20/08.
    const { gte } = reviewedWindow(new Date('2026-08-20T17:30:00.000Z'))
    expect(gte.toISOString()).toBe('2026-08-20T17:00:00.000Z')
  })

  it('selects both duyệt’d states, inside the kế toán’s trạm only', () => {
    const where = approvedTodaySelection([STATION_A, STATION_B], new Date()).where as {
      reviewStatus: { in: string[] }
      stationId: { in: string[] }
    }
    expect(where.reviewStatus.in).toEqual(['approved', 'corrected'])
    expect(where.stationId.in).toEqual([STATION_A, STATION_B])
  })
})

function visit(overrides: Partial<ApprovedVisitInput> = {}): ApprovedVisitInput {
  return {
    id: 'v1',
    stationId: STATION_A,
    visitDate: new Date('2026-08-20T02:00:00.000Z'),
    reviewedAt: new Date('2026-08-20T03:00:00.000Z'),
    plateRead: '50E-75317',
    plateConfirmed: null,
    litersRead: 100,
    customerId: 'c1',
    ...overrides,
  }
}

const SHIFT_TODAY: ShiftDayInput = {
  id: 'shift-today',
  stationId: STATION_A,
  shiftDate: day('2026-08-20'),
}
const SHIFT_YESTERDAY: ShiftDayInput = {
  id: 'shift-yesterday',
  stationId: STATION_A,
  shiftDate: day('2026-08-19'),
}

const names = new Map([['c1', 'Quang Dũng']])

describe('buildApprovedTodayList', () => {
  it('links a lượt xe to the ca of its own ngày', () => {
    const [row] = buildApprovedTodayList([visit()], [SHIFT_TODAY, SHIFT_YESTERDAY], names)
    expect(row?.shiftId).toBe('shift-today')
  })

  it('points a yesterday lượt xe duyệt’d this morning at yesterday’s ca', () => {
    const [row] = buildApprovedTodayList(
      [visit({ visitDate: new Date('2026-08-19T08:00:00.000Z') })],
      [SHIFT_TODAY, SHIFT_YESTERDAY],
      names
    )
    expect(row?.shiftId).toBe('shift-yesterday')
  })

  it('reads the ngày of a late-evening lượt xe the way the trạm does', () => {
    // 23:00 on 19/08 in Vietnam is still 19/08, though UTC says 16:00.
    const [row] = buildApprovedTodayList(
      [visit({ visitDate: new Date('2026-08-19T16:00:00.000Z') })],
      [SHIFT_TODAY, SHIFT_YESTERDAY],
      names
    )
    expect(row?.shiftId).toBe('shift-yesterday')
  })

  it('never links to another trạm’s ca on the same ngày', () => {
    const [row] = buildApprovedTodayList([visit({ stationId: STATION_B })], [SHIFT_TODAY], names)
    expect(row?.shiftId).toBeNull()
  })

  it('still renders a row whose ngày has no ca, without a link', () => {
    const [row] = buildApprovedTodayList([visit()], [], names)
    expect(row?.shiftId).toBeNull()
    expect(row?.plate).toBe('50E-75317')
  })

  it('uses the confirmed plate over the read plate', () => {
    const [row] = buildApprovedTodayList(
      [visit({ plateConfirmed: '51C-12345' })],
      [SHIFT_TODAY],
      names
    )
    expect(row?.plate).toBe('51C-12345')
  })

  it('leaves the plate empty when neither was read nor confirmed', () => {
    const [row] = buildApprovedTodayList(
      [visit({ plateRead: null, plateConfirmed: null })],
      [SHIFT_TODAY],
      names
    )
    expect(row?.plate).toBe('')
  })

  it('names the khách hàng, and leaves it empty when unassigned', () => {
    const [named] = buildApprovedTodayList([visit()], [SHIFT_TODAY], names)
    expect(named?.customerName).toBe('Quang Dũng')
    const [unnamed] = buildApprovedTodayList([visit({ customerId: null })], [SHIFT_TODAY], names)
    expect(unnamed?.customerName).toBe('')
  })

  it('carries số lít through, null and all', () => {
    const [row] = buildApprovedTodayList([visit({ litersRead: 42.5 })], [SHIFT_TODAY], names)
    expect(row?.liters).toBe(42.5)
    const [none] = buildApprovedTodayList([visit({ litersRead: null })], [SHIFT_TODAY], names)
    expect(none?.liters).toBeNull()
  })

  it('puts the newest duyệt first, so the card that just left is on top', () => {
    const rows = buildApprovedTodayList(
      [
        visit({ id: 'early', reviewedAt: new Date('2026-08-20T01:00:00.000Z') }),
        visit({ id: 'late', reviewedAt: new Date('2026-08-20T09:00:00.000Z') }),
        visit({ id: 'middle', reviewedAt: new Date('2026-08-20T05:00:00.000Z') }),
      ],
      [SHIFT_TODAY],
      names
    )
    expect(rows.map((r) => r.visitId)).toEqual(['late', 'middle', 'early'])
  })

  it('has nothing to show when nothing was duyệt’d', () => {
    expect(buildApprovedTodayList([], [SHIFT_TODAY], names)).toEqual([])
  })
})
