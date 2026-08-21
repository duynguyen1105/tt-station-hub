import { describe, expect, it } from 'vitest'

import {
  type SearchableCustomer,
  debtCustomerFilter,
  filterDebtCustomers,
  hasDebtCustomerFilter,
} from '@/lib/debts/customer-search'

const QUANG_DUNG: SearchableCustomer = {
  name: 'Quang Dũng',
  misaCode: 'QD',
  knownPlates: ['50H-210.10', '50E-643.00', '61H-047.99'],
  balance: 15_666_453,
}

const NGOC_HONG: SearchableCustomer = {
  name: 'Ngọc Hồng',
  misaCode: null,
  knownPlates: [],
  balance: 0,
}

const TIEN_OANH: SearchableCustomer = {
  name: 'Tiến Oanh',
  misaCode: 'TO',
  knownPlates: ['51D-123.45'],
  balance: 0,
}

/** A khách hàng who has paid more than they owed, so their dư nợ has gone under. */
const OVERPAID: SearchableCustomer = {
  name: 'Tường Vy',
  misaCode: 'TV',
  knownPlates: [],
  balance: -200_000,
}

const ALL = [QUANG_DUNG, NGOC_HONG, TIEN_OANH, OVERPAID]

/** The names left after searching, which is what the table would print. */
function namesFor(q: string, customers: SearchableCustomer[] = ALL): string[] {
  return filterDebtCustomers(customers, debtCustomerFilter({ q })).map((c) => c.name)
}

describe('filterDebtCustomers — tìm theo tên', () => {
  it('finds a name typed without dấu, which is how it is typed in a hurry', () => {
    expect(namesFor('quang dung')).toEqual(['Quang Dũng'])
  })

  it('finds a name typed with the wrong dấu, since the dấu are ignored either way', () => {
    expect(namesFor('quàng dùng')).toEqual(['Quang Dũng'])
  })

  it('ignores case, so a name typed in lowercase still finds it', () => {
    expect(namesFor('NGOC')).toEqual(['Ngọc Hồng'])
  })

  it('matches part of a name, because half a name is what is usually remembered', () => {
    expect(namesFor('oanh')).toEqual(['Tiến Oanh'])
  })

  it('folds đ to d, the one Vietnamese letter a dấu-strip leaves standing', () => {
    const customers = [{ ...NGOC_HONG, name: 'Đũng Đại' }]
    expect(namesFor('dung dai', customers)).toEqual(['Đũng Đại'])
  })
})

describe('filterDebtCustomers — tìm theo biển số', () => {
  it.each([
    ['50h21010', 'bare, lowercase, as it is typed'],
    ['50H-210.10', 'exactly as the plate is written'],
    ['50H 210 10', 'with spaces instead of punctuation'],
  ])('finds the owner of a biển số given as %s (%s)', (plate) => {
    expect(namesFor(plate)).toEqual(['Quang Dũng'])
  })

  it('finds the owner from the tail of a biển số, which is the part read out', () => {
    expect(namesFor('64300')).toEqual(['Quang Dũng'])
  })

  it('searches every biển số a khách hàng drives, not just the first', () => {
    expect(namesFor('61H-047.99')).toEqual(['Quang Dũng'])
  })

  it('leaves a khách hàng with no biển số out of a biển số search', () => {
    expect(namesFor('51D12345')).toEqual(['Tiến Oanh'])
  })
})

describe('filterDebtCustomers — tìm theo mã MISA', () => {
  it('finds a khách hàng by their mã MISA, copied straight out of MISA', () => {
    expect(namesFor('QD')).toEqual(['Quang Dũng'])
  })

  it('ignores case in a mã MISA', () => {
    expect(namesFor('tv')).toEqual(['Tường Vy'])
  })

  it('does not trip over a khách hàng who has no mã yet', () => {
    expect(namesFor('qd', [NGOC_HONG, QUANG_DUNG])).toEqual(['Quang Dũng'])
  })
})

describe('filterDebtCustomers — chỉ khách còn nợ', () => {
  const owing = (customers: SearchableCustomer[] = ALL) =>
    filterDebtCustomers(customers, debtCustomerFilter({ owing: '1' })).map((c) => c.name)

  it('keeps only the khách hàng who actually owe something', () => {
    expect(owing()).toEqual(['Quang Dũng'])
  })

  it('drops a khách hàng at 0 đ, who is the noise this toggle exists to remove', () => {
    expect(owing([NGOC_HONG])).toEqual([])
  })

  it('drops a khách hàng who has overpaid — owing nothing is not owing', () => {
    expect(owing([OVERPAID])).toEqual([])
  })

  it('combines with the search, so a match that owes nothing is still dropped', () => {
    const filter = debtCustomerFilter({ q: 'oanh', owing: '1' })
    expect(filterDebtCustomers(ALL, filter)).toEqual([])
  })
})

describe('filterDebtCustomers — không khớp', () => {
  it('hands back nothing rather than everything when the search matches no one', () => {
    expect(namesFor('không có ai')).toEqual([])
  })

  it('hands back the very same array when nothing is narrowing the list', () => {
    expect(filterDebtCustomers(ALL, debtCustomerFilter({}))).toBe(ALL)
  })
})

describe('debtCustomerFilter', () => {
  it.each<[string | undefined, string]>([
    ['   ', 'nothing but spaces'],
    ['', 'empty'],
    [undefined, 'absent'],
  ])('treats a query of %s (%s) as no search at all', (q) => {
    expect(debtCustomerFilter({ q }).q).toBeUndefined()
  })

  it('trims the query, so a trailing space pasted with a biển số still matches', () => {
    expect(debtCustomerFilter({ q: '  quang  ' }).q).toBe('quang')
  })

  it.each<[string | undefined, string]>([
    ['0', 'off'],
    ['true', 'a word rather than the flag'],
    ['', 'empty'],
    [undefined, 'absent'],
  ])('leaves chỉ khách còn nợ off for %s (%s)', (owing) => {
    expect(debtCustomerFilter({ owing }).owing).toBe(false)
  })

  it('turns chỉ khách còn nợ on for 1, which is what the toggle writes', () => {
    expect(debtCustomerFilter({ owing: '1' }).owing).toBe(true)
  })
})

describe('hasDebtCustomerFilter', () => {
  it('is false as the tab opens, so Xóa bộ lọc is not offered against nothing', () => {
    expect(hasDebtCustomerFilter(debtCustomerFilter({}))).toBe(false)
  })

  it('is true once a search is narrowing the list', () => {
    expect(hasDebtCustomerFilter(debtCustomerFilter({ q: 'quang' }))).toBe(true)
  })

  it('is true once chỉ khách còn nợ is narrowing the list', () => {
    expect(hasDebtCustomerFilter(debtCustomerFilter({ owing: '1' }))).toBe(true)
  })

  it('is false for a query that was ignored, matching what the table shows', () => {
    expect(hasDebtCustomerFilter(debtCustomerFilter({ q: '   ' }))).toBe(false)
  })
})
