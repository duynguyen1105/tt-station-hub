import { describe, expect, it } from 'vitest'

import { MISA_REPORT_PAGE_SIZE, misaReportSelection } from '@/lib/misa-export/report-selection'

const STATION_A = 'aaaaaaaa-0000-0000-0000-000000000001'
const STATION_B = 'bbbbbbbb-0000-0000-0000-000000000002'

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
