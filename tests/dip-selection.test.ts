import { describe, expect, it } from 'vitest'

import {
  DIP_PAGE_SIZE,
  DIP_STATUSES,
  type DipSelection,
  type DipSelectionParams,
  dipSelection,
  hasDipFilter,
} from '@/lib/inventory/dip-selection'

const STATION = 'aaaaaaaa-0000-0000-0000-000000000001'

/** The hầm and nhiên liệu the trạm under test has — what any URL is narrowed against. */
const OFFERED = {
  tanks: ['HAM_1', 'HAM_2', 'HAM_3'],
  fuels: ['XANG_E0', 'DAU_DO', 'DAU_DC'],
}

function select(params: DipSelectionParams): DipSelection {
  return dipSelection(params, STATION, OFFERED)
}

function dayWindow(params: DipSelectionParams): { gte?: Date; lte?: Date } | undefined {
  return select(params).where.measuredAt as { gte?: Date; lte?: Date } | undefined
}

function picked(params: DipSelectionParams, column: 'tankCode' | 'fuelType' | 'reviewStatus') {
  return select(params).where[column] as { in: string[] } | undefined
}

describe('dipSelection', () => {
  it('shows one trạm’s whole history when the URL asks for nothing', () => {
    const selection = select({})
    expect(selection.where).toEqual({ stationId: STATION })
    expect(selection.skip).toBe(0)
    expect(selection.take).toBe(DIP_PAGE_SIZE)
    expect(selection.page).toBe(1)
  })

  it('lists a từ chối read like any other, because the history is the audit trail', () => {
    // The absence of a reviewStatus constraint is the whole point: `countableDipWhere`
    // governs the figures a dip feeds, never this table.
    expect(select({}).where.reviewStatus).toBeUndefined()
  })

  it('orders newest first and breaks the tie on id, so paging can’t drop or repeat a đo hầm', () => {
    // A burst of Zalo photos lands on one measuredAt; without the tie-break a row could
    // hide between two pages.
    expect(select({}).orderBy).toEqual([{ measuredAt: 'desc' }, { id: 'asc' }])
  })

  it('takes the page the URL asked for', () => {
    const selection = select({ page: '3' })
    expect(selection.page).toBe(3)
    expect(selection.skip).toBe(2 * DIP_PAGE_SIZE)
  })

  it.each([
    ['0', 'a page before the first'],
    ['-2', 'a negative page'],
    ['hai', 'words'],
    ['', 'empty'],
  ])('falls back to page 1 for %s (%s)', (raw) => {
    expect(select({ page: raw }).page).toBe(1)
  })
})

describe('dipSelection — lọc theo khoảng ngày', () => {
  it('opens từ ngày at its first millisecond in Vietnam, not at UTC midnight', () => {
    // measured_at is an instant, so a ngày kế toán types means that ngày in Vietnam.
    expect(dayWindow({ from: '2026-08-18' })?.gte?.toISOString()).toBe('2026-08-17T17:00:00.000Z')
  })

  it('closes đến ngày at its last millisecond in Vietnam', () => {
    expect(dayWindow({ to: '2026-08-18' })?.lte?.toISOString()).toBe('2026-08-18T16:59:59.999Z')
  })

  it('accepts either bound on its own', () => {
    expect(dayWindow({ from: '2026-08-01' })?.lte).toBeUndefined()
    expect(dayWindow({ to: '2026-08-31' })?.gte).toBeUndefined()
  })

  it('leaves a range running backwards to match nothing rather than repairing it', () => {
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
    const selection = select({ from: raw })
    expect(selection.where.measuredAt).toBeUndefined()
    expect(selection.from).toBeUndefined()
  })

  it('echoes back only the ngày that actually applied, so a mistyped one un-ticks itself', () => {
    const selection = select({ from: '2026-08-01', to: '2026-02-30' })
    expect(selection.from).toBe('2026-08-01')
    expect(selection.to).toBeUndefined()
  })
})

describe.each([
  ['hầm', 'tank' as const, 'tankCode' as const, 'tanks' as const, OFFERED.tanks],
  ['nhiên liệu', 'fuel' as const, 'fuelType' as const, 'fuels' as const, OFFERED.fuels],
  [
    'trạng thái',
    'status' as const,
    'reviewStatus' as const,
    'statuses' as const,
    [...DIP_STATUSES],
  ],
])('dipSelection — lọc theo %s', (_name, param, column, applied, offered) => {
  const [first, second] = offered

  it('narrows to what was ticked', () => {
    const selection = select({ [param]: first })
    expect(picked({ [param]: first }, column)).toEqual({ in: [first] })
    expect(selection[applied]).toEqual([first])
  })

  it('narrows to several at once', () => {
    expect(picked({ [param]: `${first},${second}` }, column)).toEqual({ in: [first, second] })
  })

  it('means tất cả when nothing is ticked', () => {
    expect(picked({}, column)).toBeUndefined()
    expect(select({})[applied]).toEqual([])
  })

  it('narrows and never widens: a value nobody offers is dropped', () => {
    expect(select({ [param]: `${first},KHONG_CO` })[applied]).toEqual([first])
  })

  it('falls back to tất cả when nothing asked for survives', () => {
    const selection = select({ [param]: 'KHONG_CO' })
    expect(selection[applied]).toEqual([])
    expect(selection.where[column]).toBeUndefined()
  })

  it('collapses repeats and settles on one order, however the URL listed them', () => {
    const backwards = select({ [param]: `${second},${first},${second}` })
    expect(backwards[applied]).toEqual([first, second])
    expect(backwards[applied]).toEqual(select({ [param]: `${first},${second}` })[applied])
  })
})

describe('dipSelection — nhiều tiêu chí', () => {
  it('combines every criterion into one where', () => {
    const selection = select({
      from: '2026-08-01',
      to: '2026-08-31',
      tank: 'HAM_2',
      fuel: 'DAU_DO',
      status: 'pending,rejected',
    })
    expect(selection.where).toEqual({
      stationId: STATION,
      measuredAt: {
        gte: new Date('2026-08-01T00:00:00.000+07:00'),
        lte: new Date('2026-08-31T23:59:59.999+07:00'),
      },
      tankCode: { in: ['HAM_2'] },
      fuelType: { in: ['DAU_DO'] },
      reviewStatus: { in: ['pending', 'rejected'] },
    })
  })
})

describe('hasDipFilter', () => {
  it('reads an unfiltered history as unfiltered', () => {
    expect(hasDipFilter(select({}))).toBe(false)
  })

  // Typed as one tuple so the five shapes don't infer as a union of five different
  // parameter lists.
  const narrowed: [DipSelectionParams, string][] = [
    [{ from: '2026-08-01' }, 'a từ ngày'],
    [{ to: '2026-08-31' }, 'an đến ngày'],
    [{ tank: 'HAM_1' }, 'a hầm'],
    [{ fuel: 'DAU_DO' }, 'a nhiên liệu'],
    [{ status: 'pending' }, 'a trạng thái'],
  ]

  it.each(narrowed)('reads %o (%s) as narrowed', (params) => {
    expect(hasDipFilter(select(params))).toBe(true)
  })

  it('reads a mistyped ngày as unfiltered, so Xóa bộ lọc stays out of the way', () => {
    expect(hasDipFilter(select({ from: '2026-02-30' }))).toBe(false)
  })

  it('reads a hầm this trạm does not have as unfiltered', () => {
    expect(hasDipFilter(select({ tank: 'KHONG_CO' }))).toBe(false)
  })
})
