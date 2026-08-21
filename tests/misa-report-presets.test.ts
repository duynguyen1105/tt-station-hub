import { describe, expect, it } from 'vitest'

import { reportPresetRange } from '@/lib/misa-export/report-presets'

// Every moment below is an instant in UTC: 09:00 in Vietnam is 02:00 UTC the same ngày.

describe('reportPresetRange', () => {
  describe('hôm nay', () => {
    it('is the current Vietnam ngày at both ends', () => {
      expect(reportPresetRange('today', new Date('2026-08-21T02:00:00.000Z'))).toEqual({
        from: '2026-08-21',
        to: '2026-08-21',
      })
    })

    it('keeps a late evening on the ngày the trạm calls it', () => {
      // 23:30 on 21/08 in Vietnam, though UTC already reads 16:30.
      expect(reportPresetRange('today', new Date('2026-08-21T16:30:00.000Z'))).toEqual({
        from: '2026-08-21',
        to: '2026-08-21',
      })
    })

    it('rolls past Vietnam midnight onto the next ngày', () => {
      // 00:30 on 22/08 in Vietnam, though UTC says 17:30 on 21/08.
      expect(reportPresetRange('today', new Date('2026-08-21T17:30:00.000Z'))).toEqual({
        from: '2026-08-22',
        to: '2026-08-22',
      })
    })
  })

  describe('tháng này', () => {
    it('runs from the first to the last ngày of a 31-day tháng', () => {
      expect(reportPresetRange('thisMonth', new Date('2026-08-21T02:00:00.000Z'))).toEqual({
        from: '2026-08-01',
        to: '2026-08-31',
      })
    })

    it('runs to the 30th of a 30-day tháng', () => {
      expect(reportPresetRange('thisMonth', new Date('2026-09-15T02:00:00.000Z'))).toEqual({
        from: '2026-09-01',
        to: '2026-09-30',
      })
    })

    it('ends tháng 2 on the 28th outside a leap year', () => {
      expect(reportPresetRange('thisMonth', new Date('2026-02-10T02:00:00.000Z'))).toEqual({
        from: '2026-02-01',
        to: '2026-02-28',
      })
    })

    it('ends tháng 2 on the 29th in a leap year', () => {
      expect(reportPresetRange('thisMonth', new Date('2028-02-10T02:00:00.000Z'))).toEqual({
        from: '2028-02-01',
        to: '2028-02-29',
      })
    })

    it('still says tháng 8 on the last evening of tháng 8', () => {
      // 23:30 on 31/08 in Vietnam — UTC has not turned the ngày over yet either.
      expect(reportPresetRange('thisMonth', new Date('2026-08-31T16:30:00.000Z'))).toEqual({
        from: '2026-08-01',
        to: '2026-08-31',
      })
    })

    it('says tháng 9 half an hour into 01/09 Vietnam time', () => {
      // 00:30 on 01/09 in Vietnam, though UTC still says 31/08.
      expect(reportPresetRange('thisMonth', new Date('2026-08-31T17:30:00.000Z'))).toEqual({
        from: '2026-09-01',
        to: '2026-09-30',
      })
    })
  })

  describe('tháng trước', () => {
    it('spans the whole of the tháng just closed', () => {
      // The first ngày of tháng 8 — the ngày kế toán closes tháng 7's books.
      expect(reportPresetRange('lastMonth', new Date('2026-08-02T02:00:00.000Z'))).toEqual({
        from: '2026-07-01',
        to: '2026-07-31',
      })
    })

    it('crosses into the previous year in tháng 1', () => {
      expect(reportPresetRange('lastMonth', new Date('2027-01-03T02:00:00.000Z'))).toEqual({
        from: '2026-12-01',
        to: '2026-12-31',
      })
    })

    it('ends a 30-day previous tháng on the 30th', () => {
      expect(reportPresetRange('lastMonth', new Date('2026-05-04T02:00:00.000Z'))).toEqual({
        from: '2026-04-01',
        to: '2026-04-30',
      })
    })

    it('ends a non-leap tháng 2 on the 28th', () => {
      expect(reportPresetRange('lastMonth', new Date('2026-03-01T02:00:00.000Z'))).toEqual({
        from: '2026-02-01',
        to: '2026-02-28',
      })
    })

    it('ends a leap tháng 2 on the 29th', () => {
      expect(reportPresetRange('lastMonth', new Date('2028-03-01T02:00:00.000Z'))).toEqual({
        from: '2028-02-01',
        to: '2028-02-29',
      })
    })

    it('reads the tháng from the Vietnam ngày, not the UTC one', () => {
      // 00:30 on 01/08 in Vietnam, though UTC still says 31/07: tháng trước is 7.
      expect(reportPresetRange('lastMonth', new Date('2026-07-31T17:30:00.000Z'))).toEqual({
        from: '2026-07-01',
        to: '2026-07-31',
      })
    })
  })
})
