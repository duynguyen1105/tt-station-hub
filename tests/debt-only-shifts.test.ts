import { describe, expect, it } from 'vitest'

import { type DebtDay, debtDaysMissingShift } from '@/lib/debts/debt-only-shifts'

const STATION_A = 'aaaaaaaa-0000-0000-0000-000000000001'
const STATION_B = 'bbbbbbbb-0000-0000-0000-000000000002'

/** A shiftDate as stored: UTC midnight labelled with the Vietnam calendar day. */
function day(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

function keys(days: DebtDay[]): string[] {
  return days.map((d) => `${d.stationId}@${d.shiftDate.toISOString().slice(0, 10)}x${d.visitCount}`)
}

describe('debtDaysMissingShift', () => {
  it('groups a station’s visits into one day, counting them', () => {
    const { missing } = debtDaysMissingShift(
      [
        { stationId: STATION_A, visitDate: new Date('2026-08-19T02:00:00.000Z') },
        { stationId: STATION_A, visitDate: new Date('2026-08-19T09:30:00.000Z') },
      ],
      []
    )
    expect(keys(missing)).toEqual([`${STATION_A}@2026-08-19x2`])
  })

  it('keeps a late-evening visit on the day the trạm calls it (GMT+7)', () => {
    // 23:00 on 19/08 in Vietnam is still 19/08, though UTC already says 16:00.
    const { missing } = debtDaysMissingShift(
      [{ stationId: STATION_A, visitDate: new Date('2026-08-19T16:00:00.000Z') }],
      []
    )
    expect(keys(missing)).toEqual([`${STATION_A}@2026-08-19x1`])
  })

  it('rolls a visit past Vietnam midnight onto the next day', () => {
    // 00:30 on 20/08 in Vietnam — the trạm's next day, though UTC says 19/08.
    const { missing } = debtDaysMissingShift(
      [{ stationId: STATION_A, visitDate: new Date('2026-08-19T17:30:00.000Z') }],
      []
    )
    expect(keys(missing)).toEqual([`${STATION_A}@2026-08-20x1`])
  })

  it('separates the same day at two trạm', () => {
    const { missing } = debtDaysMissingShift(
      [
        { stationId: STATION_B, visitDate: new Date('2026-08-19T02:00:00.000Z') },
        { stationId: STATION_A, visitDate: new Date('2026-08-19T02:00:00.000Z') },
      ],
      []
    )
    expect(keys(missing)).toEqual([`${STATION_A}@2026-08-19x1`, `${STATION_B}@2026-08-19x1`])
  })

  it('reports a day that already has a ca as skipped, not missing', () => {
    const { missing, skipped } = debtDaysMissingShift(
      [{ stationId: STATION_A, visitDate: new Date('2026-08-19T02:00:00.000Z') }],
      [{ stationId: STATION_A, shiftDate: day('2026-08-19') }]
    )
    expect(missing).toEqual([])
    expect(keys(skipped)).toEqual([`${STATION_A}@2026-08-19x1`])
  })

  it('matches an existing ca by trạm as well as by day', () => {
    const { missing, skipped } = debtDaysMissingShift(
      [
        { stationId: STATION_A, visitDate: new Date('2026-08-19T02:00:00.000Z') },
        { stationId: STATION_B, visitDate: new Date('2026-08-19T02:00:00.000Z') },
      ],
      [{ stationId: STATION_A, shiftDate: day('2026-08-19') }]
    )
    expect(keys(missing)).toEqual([`${STATION_B}@2026-08-19x1`])
    expect(keys(skipped)).toEqual([`${STATION_A}@2026-08-19x1`])
  })

  it('leaves a ca on a day with no lượt xe out of both lists', () => {
    const { missing, skipped } = debtDaysMissingShift(
      [],
      [{ stationId: STATION_A, shiftDate: day('2026-08-19') }]
    )
    expect(missing).toEqual([])
    expect(skipped).toEqual([])
  })

  it('remembers the earliest lượt xe of the day, whatever order they arrive in', () => {
    const { missing } = debtDaysMissingShift(
      [
        { stationId: STATION_A, visitDate: new Date('2026-08-19T09:30:00.000Z') },
        { stationId: STATION_A, visitDate: new Date('2026-08-19T02:00:00.000Z') },
      ],
      []
    )
    expect(missing[0]?.firstVisitDate.toISOString()).toBe('2026-08-19T02:00:00.000Z')
  })

  it('orders days chronologically within a trạm', () => {
    const { missing } = debtDaysMissingShift(
      [
        { stationId: STATION_A, visitDate: new Date('2026-08-21T02:00:00.000Z') },
        { stationId: STATION_A, visitDate: new Date('2026-08-19T02:00:00.000Z') },
      ],
      []
    )
    expect(keys(missing)).toEqual([`${STATION_A}@2026-08-19x1`, `${STATION_A}@2026-08-21x1`])
  })
})
