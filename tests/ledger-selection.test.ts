import { describe, expect, it } from 'vitest'

import { dailyLedger } from '@/lib/inventory/book-stock'
import { type LedgerRow, hasLedgerFilter, ledgerSelection } from '@/lib/inventory/ledger-selection'

/** A sổ sách row with only the parts the filter reads spelled out. */
function row(date: string, fuel: string, openingOfDay = 0): LedgerRow {
  return {
    date,
    fuel,
    openingOfDay,
    importedLiters: 0,
    soldLiters: 0,
    adjustedLiters: 0,
    closingOfDay: openingOfDay,
  }
}

/** Three ngày of two nhiên liệu, newest first — the order the tab hands them over in. */
const ROWS: LedgerRow[] = [
  row('2026-08-18', 'DO'),
  row('2026-08-18', 'E0'),
  row('2026-08-17', 'DO'),
  row('2026-08-17', 'E0'),
  row('2026-07-31', 'DO'),
  row('2026-07-31', 'E0'),
]

/** Just the ngày and khóa of what survived, which is what the assertions are about. */
function kept(rows: LedgerRow[]): string[] {
  return rows.map((r) => `${r.date} ${r.fuel}`)
}

describe('ledgerSelection', () => {
  it('hands back every ngày when nothing narrows, in the order the sổ sách was built in', () => {
    expect(kept(ledgerSelection({}, ROWS).rows)).toEqual(kept(ROWS))
    expect(ledgerSelection({}, ROWS).total).toBe(6)
  })

  it('counts what matched rather than what fits on the page, so the pager knows how far it goes', () => {
    const many = Array.from({ length: 45 }, (_, i) =>
      row(`2026-08-${String(i + 1).padStart(2, '0')}`, 'DO')
    )
    const selection = ledgerSelection({ page: '2' }, many)
    expect(selection.total).toBe(45)
    expect(selection.rows).toHaveLength(20)
    expect(selection.rows[0]?.date).toBe('2026-08-21')
  })

  it('gives back an empty page rather than erroring for a page past the end', () => {
    expect(ledgerSelection({ page: '9' }, ROWS).rows).toEqual([])
  })

  it.each([
    ['0', 'a page before the first'],
    ['-3', 'a negative page'],
    ['abc', 'words'],
    ['', 'empty'],
  ])('falls back to page 1 for %s (%s)', (raw) => {
    expect(ledgerSelection({ page: raw }, ROWS).page).toBe(1)
  })
})

describe('ledgerSelection — lọc theo khoảng ngày', () => {
  it('keeps both bounds inclusive, because kế toán names the ngày they mean to see', () => {
    const selection = ledgerSelection({ from: '2026-08-17', to: '2026-08-18' }, ROWS)
    expect(kept(selection.rows)).toEqual([
      '2026-08-18 DO',
      '2026-08-18 E0',
      '2026-08-17 DO',
      '2026-08-17 E0',
    ])
  })

  it('narrows on từ ngày alone, leaving đến ngày open', () => {
    expect(kept(ledgerSelection({ from: '2026-08-18' }, ROWS).rows)).toEqual([
      '2026-08-18 DO',
      '2026-08-18 E0',
    ])
  })

  it('narrows on đến ngày alone, leaving từ ngày open', () => {
    expect(kept(ledgerSelection({ to: '2026-07-31' }, ROWS).rows)).toEqual([
      '2026-07-31 DO',
      '2026-07-31 E0',
    ])
  })

  it('matches nothing for a range running backwards, rather than quietly swapping it', () => {
    expect(ledgerSelection({ from: '2026-08-18', to: '2026-08-17' }, ROWS).total).toBe(0)
  })

  it('leaves Tồn đầu ngày chained from the số đầu kỳ, so a từ ngày cannot restart the sổ sách', () => {
    // 1.000 lít đầu kỳ, then 200 in and 50 out on three consecutive ngày. The ngày of
    // 20/08 opens at 1.300 — everything that moved before it — and must go on saying so
    // when kế toán asks to see 20/08 onwards. Narrowing the movements instead would
    // restart the chain and read 1.000: wrong, and entirely plausible.
    const chained = dailyLedger(1000, new Date('2026-08-18T00:00:00.000Z'), [
      { movementType: 'import', quantity: 200, movementDate: new Date('2026-08-18T00:00:00.000Z') },
      { movementType: 'sale', quantity: -50, movementDate: new Date('2026-08-18T00:00:00.000Z') },
      { movementType: 'import', quantity: 200, movementDate: new Date('2026-08-19T00:00:00.000Z') },
      { movementType: 'sale', quantity: -50, movementDate: new Date('2026-08-19T00:00:00.000Z') },
      { movementType: 'import', quantity: 200, movementDate: new Date('2026-08-20T00:00:00.000Z') },
      { movementType: 'sale', quantity: -50, movementDate: new Date('2026-08-20T00:00:00.000Z') },
    ]).map((r) => ({ fuel: 'DO', ...r }))

    const selection = ledgerSelection({ from: '2026-08-20' }, chained)
    expect(selection.rows).toHaveLength(1)
    expect(selection.rows[0]?.date).toBe('2026-08-20')
    expect(selection.rows[0]?.openingOfDay).toBe(1300)
  })

  it.each([
    ['18/08/2026', 'a Vietnamese-looking date'],
    ['2026-8-18', 'an unpadded month'],
    ['2026-13-01', 'a month that does not exist'],
    ['2026-02-30', 'a day that does not exist'],
    ['hôm nay', 'words'],
    ['', 'empty'],
  ])('ignores %s (%s) rather than erroring the page', (raw) => {
    const selection = ledgerSelection({ from: raw, to: raw }, ROWS)
    expect(selection.total).toBe(6)
    expect(selection.from).toBeUndefined()
    expect(selection.to).toBeUndefined()
  })

  it('hands back the ngày as applied, so the bộ lọc re-renders what it filtered by', () => {
    const selection = ledgerSelection({ from: '2026-08-17', to: '2026-08-18' }, ROWS)
    expect(selection.from).toBe('2026-08-17')
    expect(selection.to).toBe('2026-08-18')
  })
})

describe('ledgerSelection — lọc theo nhiên liệu', () => {
  it('narrows to one khóa, which is the cut kế toán makes closing one nhiên liệu', () => {
    expect(kept(ledgerSelection({ fuel: 'DO' }, ROWS).rows)).toEqual([
      '2026-08-18 DO',
      '2026-08-17 DO',
      '2026-07-31 DO',
    ])
  })

  it('narrows to several khóa at once', () => {
    expect(ledgerSelection({ fuel: 'DO,E0' }, ROWS).total).toBe(6)
  })

  it('settles the khóa into one order however the boxes were ticked', () => {
    expect(ledgerSelection({ fuel: 'E0,DO' }, ROWS).fuels).toEqual(['DO', 'E0'])
  })

  it('collapses a khóa named twice, so the URL cannot say the same thing twice', () => {
    expect(ledgerSelection({ fuel: 'DO,DO' }, ROWS).fuels).toEqual(['DO'])
  })

  it('ignores a khóa the sổ sách holds no ngày for, rather than emptying the table', () => {
    const selection = ledgerSelection({ fuel: 'URE' }, ROWS)
    expect(selection.fuels).toEqual([])
    expect(selection.total).toBe(6)
  })

  it('combines with the khoảng ngày, each narrowing the other', () => {
    expect(kept(ledgerSelection({ fuel: 'E0', from: '2026-08-17' }, ROWS).rows)).toEqual([
      '2026-08-18 E0',
      '2026-08-17 E0',
    ])
  })
})

describe('ledgerSelection — nhiên liệu on offer', () => {
  it('offers every nhiên liệu the sổ sách holds a ngày for, deduped and in one order', () => {
    expect(ledgerSelection({}, ROWS).options).toEqual(['DO', 'E0'])
  })

  it('goes on offering them all while one is ticked, or the menu could not un-tick it', () => {
    expect(ledgerSelection({ fuel: 'DO' }, ROWS).options).toEqual(['DO', 'E0'])
  })

  it('is read off the rows and not the khoảng ngày, so narrowing to one ngày keeps the menu whole', () => {
    expect(ledgerSelection({ from: '2026-07-31', to: '2026-07-31' }, ROWS).options).toEqual([
      'DO',
      'E0',
    ])
  })
})

describe('hasLedgerFilter', () => {
  it('is false for an unfiltered sổ sách', () => {
    expect(hasLedgerFilter(ledgerSelection({}, ROWS))).toBe(false)
  })

  it('is false when only the page is carried, which narrows nothing', () => {
    expect(hasLedgerFilter(ledgerSelection({ page: '2' }, ROWS))).toBe(false)
  })

  it('is true for a khoảng ngày', () => {
    expect(hasLedgerFilter(ledgerSelection({ from: '2026-08-17' }, ROWS))).toBe(true)
  })

  it('is true for a nhiên liệu', () => {
    expect(hasLedgerFilter(ledgerSelection({ fuel: 'DO' }, ROWS))).toBe(true)
  })

  it('is false for a ngày that was ignored, so the screen does not claim to be narrowed', () => {
    expect(hasLedgerFilter(ledgerSelection({ from: '2026-02-30' }, ROWS))).toBe(false)
  })

  it('is false for a nhiên liệu that was ignored, leaving Xóa bộ lọc out of the way', () => {
    expect(hasLedgerFilter(ledgerSelection({ fuel: 'URE' }, ROWS))).toBe(false)
  })
})
