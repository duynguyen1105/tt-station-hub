import { describe, expect, it } from 'vitest'

import {
  filterHref,
  filterQuery,
  readDayBound,
  readDayKey,
  readInstantBound,
  readPage,
  readPicks,
} from '@/lib/filters/params'

// Every instant below is in UTC: 00:00 in Vietnam is 17:00 UTC the ngày before.

describe('readInstantBound', () => {
  it('opens từ ngày at the first millisecond of that ngày in Vietnam', () => {
    expect(readInstantBound('2026-08-21', 'start')).toEqual(new Date('2026-08-20T17:00:00.000Z'))
  })

  it('closes đến ngày at the last millisecond of that ngày in Vietnam', () => {
    expect(readInstantBound('2026-08-21', 'end')).toEqual(new Date('2026-08-21T16:59:59.999Z'))
  })

  it('ignores a ngày that never happened', () => {
    // `Date` would roll 30/02 forward to 02/03; filtering by a ngày nobody typed is
    // worse than not filtering.
    expect(readInstantBound('2026-02-30', 'start')).toBeUndefined()
    expect(readInstantBound('2026-13-01', 'start')).toBeUndefined()
  })

  it('ignores anything that is not a YYYY-MM-DD', () => {
    expect(readInstantBound('21/08/2026', 'start')).toBeUndefined()
    expect(readInstantBound('2026-8-1', 'start')).toBeUndefined()
    expect(readInstantBound('', 'start')).toBeUndefined()
    expect(readInstantBound(undefined, 'start')).toBeUndefined()
  })
})

describe('readDayBound', () => {
  it('reads the ngày as the label a @db.Date column stores', () => {
    expect(readDayBound('2026-08-21')).toEqual(new Date('2026-08-21T00:00:00.000Z'))
  })

  it('ignores a ngày that never happened', () => {
    expect(readDayBound('2026-02-30')).toBeUndefined()
    expect(readDayBound('2026-13-01')).toBeUndefined()
  })

  it('ignores anything that is not a YYYY-MM-DD', () => {
    expect(readDayBound('21/08/2026')).toBeUndefined()
    expect(readDayBound(undefined)).toBeUndefined()
  })
})

describe('readDayKey', () => {
  it('gives back the ten characters once they name a real ngày', () => {
    expect(readDayKey('2026-08-21')).toBe('2026-08-21')
  })

  it('ignores a ngày that never happened, and anything malformed', () => {
    expect(readDayKey('2026-02-30')).toBeUndefined()
    expect(readDayKey('21/08/2026')).toBeUndefined()
    expect(readDayKey(undefined)).toBeUndefined()
  })
})

// The one merge this module exists to prevent. A `@db.Date` column stores a label and a
// `DateTime` column stores a moment; reading one the other's way shifts every bound seven
// hours and, at both ends of a ngày, onto a different ngày entirely.
describe('the two ngày rules stay apart', () => {
  it('reads the same ngày seven hours apart, on different UTC days', () => {
    const instant = readInstantBound('2026-08-21', 'start')
    const label = readDayBound('2026-08-21')
    expect(instant).toBeDefined()
    expect(label).toBeDefined()
    expect(label!.getTime() - instant!.getTime()).toBe(7 * 60 * 60 * 1000)
    expect(instant!.toISOString().slice(0, 10)).toBe('2026-08-20')
    expect(label!.toISOString().slice(0, 10)).toBe('2026-08-21')
  })
})

describe('readPicks', () => {
  const offered = ['b1', 'b2', 'b3'] as const

  it('orders the picks as what is on offer orders them, not as the URL listed them', () => {
    expect(readPicks('b3,b1', offered)).toEqual(['b1', 'b3'])
  })

  it('collapses repeats', () => {
    expect(readPicks('b2,b2,b2', offered)).toEqual(['b2'])
  })

  it('drops a value this trạm does not offer', () => {
    // A stale link narrows less than it asked for, and never more.
    expect(readPicks('b1,b9', offered)).toEqual(['b1'])
    expect(readPicks('b9', offered)).toEqual([])
  })

  it('reads nothing ticked as tất cả', () => {
    expect(readPicks(undefined, offered)).toEqual([])
    expect(readPicks('', offered)).toEqual([])
  })
})

describe('readPage', () => {
  it('reads the page in the URL', () => {
    expect(readPage('3')).toBe(3)
  })

  it('falls back to the first page for anything that is not one', () => {
    expect(readPage(undefined)).toBe(1)
    expect(readPage('')).toBe(1)
    expect(readPage('0')).toBe(1)
    expect(readPage('-2')).toBe(1)
    expect(readPage('abc')).toBe(1)
  })
})

describe('filterQuery', () => {
  it('writes each criterion under its parameter, comma-joined', () => {
    expect(filterQuery({ tank: ['b1', 'b2'], fuel: ['do'] })).toBe('tank=b1%2Cb2&fuel=do')
  })

  it('leaves out anything empty, so tất cả never reaches the URL', () => {
    expect(filterQuery({ from: '2026-08-01', to: undefined, tank: [], fuel: '' })).toBe(
      'from=2026-08-01'
    )
  })

  it('carries the page only past the first', () => {
    expect(filterQuery({}, 1)).toBe('')
    expect(filterQuery({}, undefined)).toBe('')
    expect(filterQuery({}, 2)).toBe('page=2')
  })

  it('keeps the parameters in the order the caller wrote them', () => {
    expect(filterQuery({ tab: 'do-bon', from: '2026-08-01' }, 3)).toBe(
      'tab=do-bon&from=2026-08-01&page=3'
    )
  })
})

describe('filterHref', () => {
  it('leaves a bare path when nothing is applied', () => {
    expect(filterHref('/stations/s1/shifts', {})).toBe('/stations/s1/shifts')
  })

  it('hangs the criteria off the path', () => {
    expect(filterHref('/stations/s1/shifts', { status: ['closed'] }, 2)).toBe(
      '/stations/s1/shifts?status=closed&page=2'
    )
  })
})
