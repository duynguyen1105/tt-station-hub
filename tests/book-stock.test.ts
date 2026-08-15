import { describe, expect, it } from 'vitest'

import { bookSummary, dailyLedger } from '@/lib/inventory/book-stock'

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

const MOVES = [
  { movementType: 'import', quantity: 6000, movementDate: d('2026-08-01') },
  { movementType: 'sale', quantity: -1500, movementDate: d('2026-08-01') },
  { movementType: 'sale', quantity: -2000, movementDate: d('2026-08-02') },
  { movementType: 'adjustment', quantity: -100, movementDate: d('2026-08-02') },
  { movementType: 'import', quantity: 4000, movementDate: d('2026-08-04') },
]

describe('bookSummary', () => {
  it('computes đầu kỳ + nhập − xuất ± điều chỉnh', () => {
    const s = bookSummary(10000, d('2026-08-01'), MOVES)
    expect(s).toEqual({
      openingLiters: 10000,
      importedLiters: 10000,
      soldLiters: 3500,
      adjustedLiters: -100,
      bookStock: 16400,
    })
  })

  it('ignores movements dated before the opening anchor', () => {
    const s = bookSummary(10000, d('2026-08-02'), MOVES)
    expect(s.importedLiters).toBe(4000)
    expect(s.soldLiters).toBe(2000)
    expect(s.bookStock).toBe(10000 + 4000 - 2000 - 100)
  })
})

describe('dailyLedger', () => {
  it('rolls each day from the previous closing, newest first', () => {
    const rows = dailyLedger(10000, d('2026-08-01'), MOVES)
    expect(rows.map((r) => r.date)).toEqual(['2026-08-04', '2026-08-02', '2026-08-01'])
    const day1 = rows[2]!
    expect(day1.openingOfDay).toBe(10000)
    expect(day1.closingOfDay).toBe(10000 + 6000 - 1500)
    const day2 = rows[1]!
    expect(day2.openingOfDay).toBe(day1.closingOfDay)
    expect(day2.closingOfDay).toBe(day2.openingOfDay - 2000 - 100)
    const day4 = rows[0]!
    expect(day4.openingOfDay).toBe(day2.closingOfDay)
    expect(day4.closingOfDay).toBe(day4.openingOfDay + 4000)
  })

  it('returns nothing when no movement falls inside the anchor window', () => {
    expect(dailyLedger(500, d('2026-09-01'), MOVES)).toEqual([])
  })
})
