import { describe, expect, it } from 'vitest'

import {
  MISA_REPORT_PAGE_SIZE,
  type MisaReportSelection,
  hasMisaReportFilter,
  misaReportSelection,
} from '@/lib/misa-export/report-selection'

const STATION_A = 'aaaaaaaa-0000-0000-0000-000000000001'
const STATION_B = 'bbbbbbbb-0000-0000-0000-000000000002'
const STATION_C = 'cccccccc-0000-0000-0000-000000000003'

describe('misaReportSelection', () => {
  it('selects only chốt’d ca, whatever the page', () => {
    const { where } = misaReportSelection({ page: '3' }, [STATION_A])
    expect(where.status).toBe('completed')
  })

  it('orders by the ngày the table shows, newest first', () => {
    const { orderBy } = misaReportSelection({}, [STATION_A])
    expect(orderBy[0]).toEqual({ shiftDate: 'desc' })
  })

  it('breaks a tie on ngày deterministically, so paging can’t drop or repeat a ca', () => {
    const { orderBy } = misaReportSelection({}, [STATION_A])
    expect(orderBy).toHaveLength(2)
    expect(orderBy[1]).toEqual({ id: 'asc' })
  })

  it('narrows to the trạm the viewer can reach', () => {
    const { where } = misaReportSelection({}, [STATION_A, STATION_B])
    expect(where.stationId).toEqual({ in: [STATION_A, STATION_B] })
  })

  it('selects nothing for a kế toán phụ trách of no trạm, rather than everything', () => {
    const { where } = misaReportSelection({}, [])
    expect(where.stationId).toEqual({ in: [] })
  })

  it('takes a page of twenty and skips none on page 1', () => {
    const { skip, take, page } = misaReportSelection({ page: '1' }, [STATION_A])
    expect(page).toBe(1)
    expect(skip).toBe(0)
    expect(take).toBe(MISA_REPORT_PAGE_SIZE)
    expect(take).toBe(20)
  })

  it('skips a whole page per page already walked', () => {
    const { skip, take, page } = misaReportSelection({ page: '4' }, [STATION_A])
    expect(page).toBe(4)
    expect(skip).toBe(60)
    expect(take).toBe(20)
  })

  it('lands on page 1 when the URL carries no page at all', () => {
    expect(misaReportSelection({}, [STATION_A]).page).toBe(1)
  })

  it.each([
    ['abc', 'non-numeric'],
    ['0', 'zero'],
    ['-3', 'negative'],
    ['', 'empty'],
    ['0.4', 'a fraction below one'],
  ])('clamps %s (%s) to page 1 rather than erroring', (raw) => {
    const { page, skip } = misaReportSelection({ page: raw }, [STATION_A])
    expect(page).toBe(1)
    expect(skip).toBe(0)
  })

  it('reads a page number past the last page as itself — an empty page, not an error', () => {
    // Whether the page is past the end is a fact about the count, which this
    // function never sees; it simply skips past everything and takes nothing.
    const { page, skip } = misaReportSelection({ page: '9999' }, [STATION_A])
    expect(page).toBe(9999)
    expect(skip).toBe(199_960)
  })
})

/** The `shiftDate` window the selection applies, or undefined when it applies none. */
function dayWindow(params: { from?: string; to?: string }): { gte?: Date; lte?: Date } | undefined {
  return misaReportSelection(params, [STATION_A]).where.shiftDate as
    | { gte?: Date; lte?: Date }
    | undefined
}

describe('misaReportSelection — lọc theo khoảng ngày', () => {
  it('selects one Vietnam calendar day and no neighbour', () => {
    // `shiftDate` is a date column holding UTC midnight *labelled with* the
    // Vietnam day — not an instant — so 18/08 is exactly 2026-08-18T00:00:00Z,
    // and the ca of 17/08 and 19/08 sit a whole day either side of it.
    const window = dayWindow({ from: '2026-08-18', to: '2026-08-18' })
    expect(window?.gte?.toISOString()).toBe('2026-08-18T00:00:00.000Z')
    expect(window?.lte?.toISOString()).toBe('2026-08-18T00:00:00.000Z')
  })

  it('includes both endpoints of a month', () => {
    // 01/08 → 31/08 holds the ca of both 01/08 and 31/08: `lte` at the ngày
    // itself, since the stored value is midnight and nothing sits after it.
    const window = dayWindow({ from: '2026-08-01', to: '2026-08-31' })
    expect(window?.gte?.toISOString()).toBe('2026-08-01T00:00:00.000Z')
    expect(window?.lte?.toISOString()).toBe('2026-08-31T00:00:00.000Z')
  })

  it('reads the bounds at UTC midnight, not at a +07:00 offset', () => {
    // The Hàng tồn import filter parses `+07:00` because `importedAt` is a true
    // instant. Copying that here would land the bounds on 17:00 of the ngày
    // before and select the wrong ca — so both are pinned to UTC midnight on
    // the nose, whatever ngày they carry.
    const window = dayWindow({ from: '2026-01-31', to: '2026-12-01' })
    for (const bound of [window?.gte, window?.lte]) {
      expect(bound?.getUTCHours()).toBe(0)
      expect(bound?.getUTCMinutes()).toBe(0)
      expect(bound?.getUTCSeconds()).toBe(0)
      expect(bound?.getUTCMilliseconds()).toBe(0)
    }
    expect(window?.gte?.toISOString()).toBe('2026-01-31T00:00:00.000Z')
    expect(window?.lte?.toISOString()).toBe('2026-12-01T00:00:00.000Z')
  })

  it('leaves the end open when only từ ngày is given', () => {
    const window = dayWindow({ from: '2026-08-01' })
    expect(window?.gte?.toISOString()).toBe('2026-08-01T00:00:00.000Z')
    expect(window?.lte).toBeUndefined()
  })

  it('leaves the start open when only đến ngày is given', () => {
    const window = dayWindow({ to: '2026-08-31' })
    expect(window?.gte).toBeUndefined()
    expect(window?.lte?.toISOString()).toBe('2026-08-31T00:00:00.000Z')
  })

  it('constrains the ngày not at all when neither is given', () => {
    expect(dayWindow({})).toBeUndefined()
  })

  it('selects nothing for a range that runs backwards, rather than erroring', () => {
    // Nothing is both on or after 31/08 and on or before 01/08, so a typo comes
    // back empty and is recoverable by editing the dates.
    const window = dayWindow({ from: '2026-08-31', to: '2026-08-01' })
    expect(window?.gte?.getTime()).toBeGreaterThan(window!.lte!.getTime())
  })

  it.each([
    ['18/08/2026', 'a Vietnamese-looking date'],
    ['2026-8-18', 'an unpadded month'],
    ['2026-13-01', 'a month that does not exist'],
    ['2026-02-30', 'a day that does not exist'],
    ['hôm nay', 'words'],
    ['', 'empty'],
  ])('ignores %s (%s) rather than erroring the page', (raw) => {
    const selection = misaReportSelection({ from: raw, to: raw }, [STATION_A])
    expect(selection.where.shiftDate).toBeUndefined()
    expect(selection.from).toBeUndefined()
    expect(selection.to).toBeUndefined()
  })

  it('ignores a malformed bound while keeping the one that parses', () => {
    const selection = misaReportSelection({ from: '2026-08-01', to: 'sai' }, [STATION_A])
    expect(selection.from).toBe('2026-08-01')
    expect(selection.to).toBeUndefined()
    expect((selection.where.shiftDate as { lte?: Date }).lte).toBeUndefined()
  })

  it('hands back the bounds as applied, so the form re-renders what it filtered by', () => {
    const selection = misaReportSelection({ from: '2026-08-01', to: '2026-08-31' }, [STATION_A])
    expect(selection.from).toBe('2026-08-01')
    expect(selection.to).toBe('2026-08-31')
  })

  it('still selects chốt’d ca of the reachable trạm, newest ngày first, when filtered', () => {
    const { where, orderBy } = misaReportSelection({ from: '2026-08-01', to: '2026-08-31' }, [
      STATION_A,
    ])
    expect(where.status).toBe('completed')
    expect(where.stationId).toEqual({ in: [STATION_A] })
    expect(orderBy[0]).toEqual({ shiftDate: 'desc' })
  })

  it('pages a filtered list the same way it pages an unfiltered one', () => {
    const { skip, take } = misaReportSelection({ from: '2026-08-01', page: '2' }, [STATION_A])
    expect(skip).toBe(20)
    expect(take).toBe(MISA_REPORT_PAGE_SIZE)
  })
})

/** What `stationId` a selection narrows to, as the list of identifiers it allows. */
function allowedStations(selection: MisaReportSelection): string[] {
  return (selection.where.stationId as { in: string[] }).in
}

describe('misaReportSelection — lọc theo trạm', () => {
  it('narrows to the one trạm kế toán picked', () => {
    expect(
      allowedStations(misaReportSelection({ station: STATION_A }, [STATION_A, STATION_B]))
    ).toEqual([STATION_A])
  })

  it('narrows to every trạm kế toán picked, so two neighbouring trạm close in one pass', () => {
    expect(
      allowedStations(
        misaReportSelection({ station: `${STATION_A},${STATION_C}` }, [
          STATION_A,
          STATION_B,
          STATION_C,
        ])
      )
    ).toEqual([STATION_A, STATION_C])
  })

  it('keeps the reachable trạm of a mixed list and drops the rest', () => {
    // Half a hand-edited query string is not permission for the other half.
    expect(
      allowedStations(misaReportSelection({ station: `${STATION_A},${STATION_B}` }, [STATION_A]))
    ).toEqual([STATION_A])
  })

  it('degrades a list of nothing but unreachable trạm to no filter', () => {
    const selection = misaReportSelection({ station: `${STATION_B},${STATION_C}` }, [STATION_A])
    expect(allowedStations(selection)).toEqual([STATION_A])
    expect(selection.stations).toEqual([])
  })

  it('collapses a repeated trạm, so the same trạm twice is the same filter as once', () => {
    expect(
      misaReportSelection({ station: `${STATION_A},${STATION_A}` }, [STATION_A, STATION_B]).stations
    ).toEqual([STATION_A])
  })

  it('hands the trạm back in one settled order, however the URL ordered them', () => {
    // The pager re-serialises this list, so `b,a` and `a,b` must be one query
    // string rather than two links onto the same rows.
    expect(
      misaReportSelection({ station: `${STATION_B},${STATION_A}` }, [STATION_A, STATION_B]).stations
    ).toEqual([STATION_A, STATION_B])
  })

  it('ignores the blanks around a stray comma rather than erroring', () => {
    expect(
      misaReportSelection({ station: `,${STATION_A},` }, [STATION_A, STATION_B]).stations
    ).toEqual([STATION_A])
  })

  it('leaves every reachable trạm in when none is picked', () => {
    expect(allowedStations(misaReportSelection({}, [STATION_A, STATION_B]))).toEqual([
      STATION_A,
      STATION_B,
    ])
  })

  it('narrows and never widens: a trạm the viewer cannot reach falls back to the reachable set', () => {
    // Hand-editing the query string must not become a way to read another
    // trạm's ca, so an identifier outside the reachable set is simply not a
    // filter — the viewer keeps the trạm they already had.
    expect(allowedStations(misaReportSelection({ station: STATION_B }, [STATION_A]))).toEqual([
      STATION_A,
    ])
  })

  it.each([
    ['khong-phai-uuid', 'malformed'],
    ['', 'empty'],
    ['00000000-0000-0000-0000-000000000000', 'naming no trạm'],
  ])('degrades %s (%s) to no trạm filter rather than erroring', (raw) => {
    const selection = misaReportSelection({ station: raw }, [STATION_A, STATION_B])
    expect(allowedStations(selection)).toEqual([STATION_A, STATION_B])
    expect(selection.stations).toEqual([])
  })

  it('still selects nothing for a kế toán phụ trách of no trạm, whatever the URL says', () => {
    const selection = misaReportSelection({ station: STATION_A }, [])
    expect(allowedStations(selection)).toEqual([])
    expect(selection.stations).toEqual([])
  })

  it('hands back the trạm as applied, so the bộ lọc re-renders what it filtered by', () => {
    expect(misaReportSelection({ station: STATION_A }, [STATION_A, STATION_B]).stations).toEqual([
      STATION_A,
    ])
  })

  it('applies the trạm and the khoảng ngày together', () => {
    const selection = misaReportSelection(
      { station: STATION_A, from: '2026-08-01', to: '2026-08-31' },
      [STATION_A, STATION_B]
    )
    expect(selection.where.stationId).toEqual({ in: [STATION_A] })
    const window = selection.where.shiftDate as { gte?: Date; lte?: Date }
    expect(window.gte?.toISOString()).toBe('2026-08-01T00:00:00.000Z')
    expect(window.lte?.toISOString()).toBe('2026-08-31T00:00:00.000Z')
    expect(selection.where.status).toBe('completed')
  })

  it('pages a trạm-filtered list the same way it pages an unfiltered one', () => {
    const { skip, take } = misaReportSelection({ station: STATION_A, page: '3' }, [
      STATION_A,
      STATION_B,
    ])
    expect(skip).toBe(40)
    expect(take).toBe(MISA_REPORT_PAGE_SIZE)
  })
})

describe('hasMisaReportFilter', () => {
  it('is false for the list as it opens, so the empty table reads as "no ca yet"', () => {
    expect(hasMisaReportFilter(misaReportSelection({}, [STATION_A]))).toBe(false)
  })

  it('is false when only the page is carried, since paging narrows nothing', () => {
    expect(hasMisaReportFilter(misaReportSelection({ page: '4' }, [STATION_A]))).toBe(false)
  })

  it('is true for a từ ngày', () => {
    expect(hasMisaReportFilter(misaReportSelection({ from: '2026-08-01' }, [STATION_A]))).toBe(true)
  })

  it('is true for an đến ngày', () => {
    expect(hasMisaReportFilter(misaReportSelection({ to: '2026-08-31' }, [STATION_A]))).toBe(true)
  })

  it('is true for a trạm', () => {
    expect(hasMisaReportFilter(misaReportSelection({ station: STATION_A }, [STATION_A]))).toBe(true)
  })

  it('is false for input that was ignored, so kế toán is not told a filter applied', () => {
    // A mistyped ngày and a trạm outside the reachable set both narrow nothing;
    // the screen shows the full list, and must say so.
    const selection = misaReportSelection({ from: '2026-13-40', station: STATION_B }, [STATION_A])
    expect(hasMisaReportFilter(selection)).toBe(false)
  })
})
