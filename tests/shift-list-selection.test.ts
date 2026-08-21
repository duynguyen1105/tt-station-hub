import { describe, expect, it } from 'vitest'

import {
  SHIFT_LIST_PAGE_SIZE,
  type ShiftListSelection,
  hasShiftListFilter,
  shiftListSelection,
} from '@/lib/shifts/shift-list-selection'

const STATION_A = 'aaaaaaaa-0000-0000-0000-000000000001'

/** The `shiftDate` window, or undefined when nothing narrowed it. */
function window(selection: ShiftListSelection): { gte?: Date; lte?: Date } | undefined {
  return selection.where.shiftDate as { gte?: Date; lte?: Date } | undefined
}

describe('shiftListSelection', () => {
  it('narrows to the trạm whose tab this is, whatever the page', () => {
    expect(shiftListSelection({ page: '3' }, STATION_A).where.stationId).toBe(STATION_A)
  })

  it('orders by the ngày the table shows, newest first', () => {
    expect(shiftListSelection({}, STATION_A).orderBy[0]).toEqual({ shiftDate: 'desc' })
  })

  it('breaks a tie on ngày, since a trạm can run Sáng and Chiều on one ngày', () => {
    // `@@unique([stationId, shiftDate, shiftType])` permits several ca on one ngày, and
    // an unordered tie could hide one of them between two pages.
    const { orderBy } = shiftListSelection({}, STATION_A)
    expect(orderBy).toHaveLength(2)
    expect(orderBy[1]).toEqual({ id: 'asc' })
  })

  it('puts no trạng thái constraint on the list as the tab opens', () => {
    const selection = shiftListSelection({}, STATION_A)
    expect(selection.where.status).toBeUndefined()
    expect(selection.statuses).toEqual([])
  })

  it('puts no ngày constraint on the list as the tab opens', () => {
    expect(window(shiftListSelection({}, STATION_A))).toBeUndefined()
  })
})

describe('shiftListSelection — lọc theo khoảng ngày', () => {
  it('selects one Vietnam calendar day and no neighbour', () => {
    const range = window(shiftListSelection({ from: '2026-08-18', to: '2026-08-18' }, STATION_A))
    expect(range?.gte?.toISOString()).toBe('2026-08-18T00:00:00.000Z')
    expect(range?.lte?.toISOString()).toBe('2026-08-18T00:00:00.000Z')
  })

  it('reads the bounds at UTC midnight, not at a +07:00 offset', () => {
    // `shift_date` is a date label and not an instant. Parsing at +07:00 — the way
    // the Hàng tồn import filter parses `importedAt`, which really is an instant —
    // would land on 17:00 the day before and select the neighbouring ca.
    const range = window(shiftListSelection({ from: '2026-08-18' }, STATION_A))
    expect(range?.gte?.toISOString()).toBe('2026-08-18T00:00:00.000Z')
    expect(range?.gte?.toISOString()).not.toBe('2026-08-17T17:00:00.000Z')
  })

  it('includes both endpoints of a month', () => {
    const range = window(shiftListSelection({ from: '2026-08-01', to: '2026-08-31' }, STATION_A))
    expect(range?.gte?.toISOString()).toBe('2026-08-01T00:00:00.000Z')
    expect(range?.lte?.toISOString()).toBe('2026-08-31T00:00:00.000Z')
  })

  it('leaves the end open when only từ ngày is given', () => {
    expect(window(shiftListSelection({ from: '2026-08-01' }, STATION_A))?.lte).toBeUndefined()
  })

  it('leaves the start open when only đến ngày is given', () => {
    expect(window(shiftListSelection({ to: '2026-08-31' }, STATION_A))?.gte).toBeUndefined()
  })

  it('selects nothing for a range that runs backwards, rather than erroring', () => {
    const range = window(shiftListSelection({ from: '2026-08-31', to: '2026-08-01' }, STATION_A))
    expect(range?.gte?.getTime()).toBeGreaterThan(range!.lte!.getTime())
  })

  it('ignores a ngày that does not exist instead of rolling it forward', () => {
    // `new Date` turns 30/02 into 02/03 rather than refusing it, and filtering by a
    // ngày nobody typed is worse than not filtering at all.
    const selection = shiftListSelection({ from: '2026-02-30' }, STATION_A)
    expect(window(selection)).toBeUndefined()
    expect(selection.from).toBeUndefined()
  })

  it.each([
    ['18/08/2026', 'not ISO'],
    ['hom-qua', 'malformed'],
    ['', 'empty'],
    ['2026-13-01', 'no such tháng'],
    ['9999-99-99', 'no such ngày at all'],
  ])('degrades %s (%s) to no ngày filter rather than erroring', (raw) => {
    const selection = shiftListSelection({ from: raw, to: raw }, STATION_A)
    expect(window(selection)).toBeUndefined()
    expect(selection.from).toBeUndefined()
    expect(selection.to).toBeUndefined()
  })

  it('ignores a malformed bound while keeping the one that parses', () => {
    const selection = shiftListSelection({ from: '2026-08-01', to: 'hom-qua' }, STATION_A)
    expect(window(selection)?.gte?.toISOString()).toBe('2026-08-01T00:00:00.000Z')
    expect(window(selection)?.lte).toBeUndefined()
    expect(selection.to).toBeUndefined()
  })

  it('hands back the bounds as applied, so the bộ lọc re-renders what it filtered by', () => {
    const selection = shiftListSelection({ from: '2026-08-01', to: '2026-08-31' }, STATION_A)
    expect(selection.from).toBe('2026-08-01')
    expect(selection.to).toBe('2026-08-31')
  })

  it('still narrows to this trạm alone, newest ngày first, when filtered', () => {
    const selection = shiftListSelection({ from: '2026-08-01' }, STATION_A)
    expect(selection.where.stationId).toBe(STATION_A)
    expect(selection.orderBy[0]).toEqual({ shiftDate: 'desc' })
  })
})

describe('shiftListSelection — lọc theo trạng thái', () => {
  it('narrows to the one trạng thái picked', () => {
    const selection = shiftListSelection({ status: 'pending_review' }, STATION_A)
    expect(selection.where.status).toEqual({ in: ['pending_review'] })
  })

  it('narrows to every trạng thái picked, so "còn cần người" is one filter', () => {
    // Đang nhận ảnh and Chờ duyệt together are the ca that still need someone.
    const selection = shiftListSelection({ status: 'collecting_photos,pending_review' }, STATION_A)
    expect(selection.where.status).toEqual({ in: ['collecting_photos', 'pending_review'] })
  })

  it('keeps the real trạng thái of a mixed list and drops the rest', () => {
    const selection = shiftListSelection({ status: 'completed,khong-co-that' }, STATION_A)
    expect(selection.statuses).toEqual(['completed'])
  })

  it('degrades a list of nothing but unknown trạng thái to no filter', () => {
    const selection = shiftListSelection({ status: 'khong-co-that,cai-gi-do' }, STATION_A)
    expect(selection.where.status).toBeUndefined()
    expect(selection.statuses).toEqual([])
  })

  it('collapses a repeated trạng thái, so the same one twice is the same filter as once', () => {
    expect(shiftListSelection({ status: 'open,open' }, STATION_A).statuses).toEqual(['open'])
  })

  it('hands the trạng thái back in lifecycle order, however the URL ordered them', () => {
    // Both spellings are the same filter, so the pager re-serialises one query string
    // rather than whichever one was pasted in.
    const asked = shiftListSelection({ status: 'completed,open' }, STATION_A)
    const reversed = shiftListSelection({ status: 'open,completed' }, STATION_A)
    expect(asked.statuses).toEqual(['open', 'completed'])
    expect(reversed.statuses).toEqual(asked.statuses)
  })

  it('ignores the blanks around a stray comma rather than erroring', () => {
    expect(shiftListSelection({ status: 'open,,completed,' }, STATION_A).statuses).toEqual([
      'open',
      'completed',
    ])
  })

  it('hands back the trạng thái as applied, so the bộ lọc re-renders what it filtered by', () => {
    const selection = shiftListSelection({ status: 'ai_processing' }, STATION_A)
    expect(selection.statuses).toEqual(['ai_processing'])
  })

  it('never widens past this trạm, whatever the URL says', () => {
    const selection = shiftListSelection({ status: 'completed' }, STATION_A)
    expect(selection.where.stationId).toBe(STATION_A)
  })

  it('applies the trạng thái and the khoảng ngày together', () => {
    const selection = shiftListSelection(
      { status: 'completed', from: '2026-08-01', to: '2026-08-31' },
      STATION_A
    )
    expect(selection.where.status).toEqual({ in: ['completed'] })
    expect(window(selection)?.gte?.toISOString()).toBe('2026-08-01T00:00:00.000Z')
    expect(window(selection)?.lte?.toISOString()).toBe('2026-08-31T00:00:00.000Z')
  })
})

describe('shiftListSelection — phân trang', () => {
  it('takes a page of twenty and skips none on page 1', () => {
    const { skip, take } = shiftListSelection({}, STATION_A)
    expect(skip).toBe(0)
    expect(take).toBe(SHIFT_LIST_PAGE_SIZE)
  })

  it('skips a whole page per page already walked', () => {
    expect(shiftListSelection({ page: '3' }, STATION_A).skip).toBe(2 * SHIFT_LIST_PAGE_SIZE)
  })

  it.each([['0'], ['-2'], ['khong-phai-so'], [undefined]])(
    'clamps page %s to the first page',
    (raw) => {
      const selection = shiftListSelection({ page: raw }, STATION_A)
      expect(selection.page).toBe(1)
      expect(selection.skip).toBe(0)
    }
  )

  it('reads a page number past the last page as itself — an empty page, not an error', () => {
    // The screen steps back onto the last real page from there; the selection just
    // returns what was asked for.
    const selection = shiftListSelection({ page: '999' }, STATION_A)
    expect(selection.page).toBe(999)
    expect(selection.skip).toBe(998 * SHIFT_LIST_PAGE_SIZE)
  })

  it('pages a filtered list the same way it pages an unfiltered one', () => {
    const selection = shiftListSelection(
      { status: 'completed', from: '2026-08-01', page: '2' },
      STATION_A
    )
    expect(selection.skip).toBe(SHIFT_LIST_PAGE_SIZE)
    expect(selection.where.status).toEqual({ in: ['completed'] })
    expect(window(selection)?.gte).toBeDefined()
  })
})

describe('hasShiftListFilter', () => {
  it('is false for the tab as it opens, so the empty list reads as "no ca yet"', () => {
    expect(hasShiftListFilter(shiftListSelection({}, STATION_A))).toBe(false)
  })

  it('is false when only the page is carried, since paging narrows nothing', () => {
    expect(hasShiftListFilter(shiftListSelection({ page: '4' }, STATION_A))).toBe(false)
  })

  it('is true for a từ ngày', () => {
    expect(hasShiftListFilter(shiftListSelection({ from: '2026-08-01' }, STATION_A))).toBe(true)
  })

  it('is true for an đến ngày', () => {
    expect(hasShiftListFilter(shiftListSelection({ to: '2026-08-31' }, STATION_A))).toBe(true)
  })

  it('is true for a trạng thái', () => {
    expect(hasShiftListFilter(shiftListSelection({ status: 'open' }, STATION_A))).toBe(true)
  })

  it('is false for input that was ignored, so nobody is told a filter applied', () => {
    const selection = shiftListSelection({ from: '2026-02-30', status: 'khong-co-that' }, STATION_A)
    expect(hasShiftListFilter(selection)).toBe(false)
  })
})
