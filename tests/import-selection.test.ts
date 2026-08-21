import { describe, expect, it } from 'vitest'

import {
  IMPORT_PAGE_SIZE,
  type ImportSelection,
  type ImportSelectionParams,
  hasImportFilter,
  importSelection,
} from '@/lib/inventory/import-selection'

const STATION_A = 'aaaaaaaa-0000-0000-0000-000000000001'
const STATION_B = 'bbbbbbbb-0000-0000-0000-000000000002'

const ADMIN = 'cccccccc-0000-0000-0000-000000000001'
const ACCOUNTANT = 'cccccccc-0000-0000-0000-000000000002'

/**
 * The hầm, nhiên liệu and người nhập this trạm's phiếu nhập actually name — what any URL
 * is narrowed against, and what `loadImportFilterOptions` reads off the slips.
 */
const OFFERED = {
  tanks: ['HAM_1', 'HAM_2', 'HAM_3'],
  fuels: ['XANG_E0', 'DAU_DO', 'DAU_DC'],
  creators: [ADMIN, ACCOUNTANT],
}

function select(params: ImportSelectionParams): ImportSelection {
  return importSelection(params, STATION_A, OFFERED)
}

/** The `importedAt` window, or undefined when nothing narrowed it. */
function window(selection: ImportSelection): { gte?: Date; lte?: Date } | undefined {
  return selection.where.importedAt as { gte?: Date; lte?: Date } | undefined
}

function picked(params: ImportSelectionParams, column: 'tankCode' | 'fuelType' | 'createdBy') {
  return select(params).where[column] as { in: string[] } | undefined
}

describe('importSelection', () => {
  it('narrows to the trạm it was handed, which is the one whose tab this is', () => {
    expect(select({}).where.stationId).toBe(STATION_A)
  })

  it('carries a set of trạm through untouched, for the Xuất Excel of every reachable trạm', () => {
    expect(importSelection({}, { in: [STATION_A, STATION_B] }, OFFERED).where.stationId).toEqual({
      in: [STATION_A, STATION_B],
    })
  })

  it('puts no constraint at all on an unfiltered list', () => {
    const selection = select({})
    expect(selection.where).toEqual({ stationId: STATION_A })
    expect(window(selection)).toBeUndefined()
  })

  it('orders newest phiếu nhập first', () => {
    expect(select({}).orderBy[0]).toEqual({ importedAt: 'desc' })
  })

  it('breaks a tie on instant deterministically, so paging can’t drop or repeat a phiếu', () => {
    // Two phiếu nhập can share an importedAt; an unordered tie could hide one
    // between two pages.
    const { orderBy } = select({})
    expect(orderBy).toHaveLength(2)
    expect(orderBy[1]).toEqual({ id: 'asc' })
  })
})

describe('importSelection — lọc theo khoảng ngày', () => {
  it('opens từ ngày at its first millisecond in Vietnam, not in UTC', () => {
    // 00:00 on 18/08 in Vietnam is 17:00 on 17/08 in UTC. Parsing at UTC midnight —
    // the way the Báo cáo MISA selection parses its ngày label — would start the
    // window seven hours early and pick up the previous evening's deliveries.
    expect(window(select({ from: '2026-08-18' }))?.gte?.toISOString()).toBe(
      '2026-08-17T17:00:00.000Z'
    )
  })

  it('closes đến ngày at its last millisecond in Vietnam', () => {
    // A phiếu nhập at 23:30 Vietnam time on the 18th is inside a đến-ngày-18/08
    // filter; the bound has to reach the end of the Vietnam ngày, not of the UTC one.
    expect(window(select({ to: '2026-08-18' }))?.lte?.toISOString()).toBe(
      '2026-08-18T16:59:59.999Z'
    )
  })

  it('leaves the other bound open when only one ngày is given', () => {
    expect(window(select({ from: '2026-08-01' }))?.lte).toBeUndefined()
    expect(window(select({ to: '2026-08-31' }))?.gte).toBeUndefined()
  })

  it('applies both bounds inclusively for a whole tháng', () => {
    const range = window(select({ from: '2026-08-01', to: '2026-08-31' }))
    expect(range?.gte?.toISOString()).toBe('2026-07-31T17:00:00.000Z')
    expect(range?.lte?.toISOString()).toBe('2026-08-31T16:59:59.999Z')
  })

  it('lets a range running backwards simply match nothing, rather than erroring', () => {
    const range = window(select({ from: '2026-08-31', to: '2026-08-01' }))
    expect(range?.gte?.getTime()).toBeGreaterThan(range!.lte!.getTime())
  })

  it('ignores a ngày that does not exist instead of rolling it forward', () => {
    // `new Date` turns 30/02 into 02/03 rather than refusing it, and filtering by a
    // ngày nobody typed is worse than not filtering at all.
    const selection = select({ from: '2026-02-30' })
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
    const selection = select({ from: raw, to: raw })
    expect(window(selection)).toBeUndefined()
    expect(selection.from).toBeUndefined()
    expect(selection.to).toBeUndefined()
  })

  it('hands back the ngày as applied, so the bộ lọc re-renders what it filtered by', () => {
    const selection = select({ from: '2026-08-01', to: '2026-08-31' })
    expect(selection.from).toBe('2026-08-01')
    expect(selection.to).toBe('2026-08-31')
  })
})

describe.each([
  ['hầm', 'tank' as const, 'tankCode' as const, 'tanks' as const, OFFERED.tanks],
  ['nhiên liệu', 'fuel' as const, 'fuelType' as const, 'fuels' as const, OFFERED.fuels],
  ['người nhập', 'creator' as const, 'createdBy' as const, 'creators' as const, OFFERED.creators],
])('importSelection — lọc theo %s', (_name, param, column, applied, offered) => {
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
    // A stale link naming a hầm no phiếu nhập of this trạm mentions, or a người nhập who
    // never recorded one, shows the whole list rather than an empty one.
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

describe('importSelection — nhiều tiêu chí', () => {
  it('combines every criterion into one where', () => {
    const selection = select({
      from: '2026-08-01',
      to: '2026-08-31',
      tank: 'HAM_2',
      fuel: 'XANG_E0',
      creator: ADMIN,
    })
    expect(selection.where).toEqual({
      stationId: STATION_A,
      importedAt: {
        gte: new Date('2026-08-01T00:00:00.000+07:00'),
        lte: new Date('2026-08-31T23:59:59.999+07:00'),
      },
      tankCode: { in: ['HAM_2'] },
      fuelType: { in: ['XANG_E0'] },
      createdBy: { in: [ADMIN] },
    })
  })
})

describe('importSelection — phân trang', () => {
  it('takes a page of twenty and skips none on page 1', () => {
    const { skip, take } = select({})
    expect(skip).toBe(0)
    expect(take).toBe(IMPORT_PAGE_SIZE)
  })

  it('skips whole pages', () => {
    expect(select({ page: '3' }).skip).toBe(2 * IMPORT_PAGE_SIZE)
  })

  it.each([['0'], ['-2'], ['khong-phai-so'], [undefined]])(
    'clamps page %s to the first page',
    (raw) => {
      const selection = select({ page: raw })
      expect(selection.page).toBe(1)
      expect(selection.skip).toBe(0)
    }
  )

  it('pages a filtered list the same way it pages an unfiltered one', () => {
    const selection = select({ from: '2026-08-01', page: '2' })
    expect(selection.skip).toBe(IMPORT_PAGE_SIZE)
    expect(window(selection)?.gte).toBeDefined()
  })
})

describe('hasImportFilter', () => {
  it('is false for the tab as it opens, so the empty table reads as "no phiếu nhập yet"', () => {
    expect(hasImportFilter(select({}))).toBe(false)
  })

  it('is false when only the page is carried, since paging narrows nothing', () => {
    expect(hasImportFilter(select({ page: '4' }))).toBe(false)
  })

  it('is true for a từ ngày', () => {
    expect(hasImportFilter(select({ from: '2026-08-01' }))).toBe(true)
  })

  it('is true for an đến ngày', () => {
    expect(hasImportFilter(select({ to: '2026-08-31' }))).toBe(true)
  })

  it('is true for a hầm', () => {
    expect(hasImportFilter(select({ tank: 'HAM_2' }))).toBe(true)
  })

  it('is true for a nhiên liệu', () => {
    expect(hasImportFilter(select({ fuel: 'XANG_E0' }))).toBe(true)
  })

  it('is true for a người nhập', () => {
    expect(hasImportFilter(select({ creator: ADMIN }))).toBe(true)
  })

  it('is false for input that was ignored, so nobody is told a filter applied', () => {
    expect(hasImportFilter(select({ from: '2026-02-30', tank: 'HAM_99' }))).toBe(false)
  })
})
