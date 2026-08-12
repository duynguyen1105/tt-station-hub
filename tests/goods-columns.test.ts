import { describe, expect, it } from 'vitest'

import { type ReceiptProduct } from '@/lib/imports/bien-ban'
import {
  STANDARD_GOODS_COLUMNS,
  bienBanSeal,
  emptyGoodsColumn,
  goodsColumnRecorded,
  goodsColumns,
} from '@/lib/imports/goods-columns'

/** One goods column as the AI read it off the paper. */
function paperColumn(productLabel: string, quantityLiters: number | null = null): ReceiptProduct {
  return {
    productLabel,
    warehouse: quantityLiters === null ? null : 'SG Petro',
    quantityLiters,
    exportSlipNo: quantityLiters === null ? null : '0029151',
    sealNo: null,
  }
}

describe('the four columns the biên bản chuẩn prints', () => {
  it('shows all four in printed order when the extraction read none of them', () => {
    expect(goodsColumns([]).map((c) => c.productLabel)).toEqual(['E0', 'EA', 'DO', 'DC'])
    expect(STANDARD_GOODS_COLUMNS).toEqual(['E0', 'EA', 'DO', 'DC'])
  })

  it('keeps the four in printed order when the sheet filled only two', () => {
    const columns = goodsColumns([paperColumn('DO', 6000), paperColumn('E0', 4000)])
    expect(columns.map((c) => c.productLabel)).toEqual(['E0', 'EA', 'DO', 'DC'])
    expect(columns.map((c) => c.quantityLiters)).toEqual(['4000', '', '6000', ''])
    expect(columns[2]?.exportSlipNo).toBe('0029151')
  })

  it('reads a header the AI returned with stray case or spacing', () => {
    const columns = goodsColumns([paperColumn(' do ', 6000)])
    expect(columns[2]?.quantityLiters).toBe('6000')
    // The header the paper printed survives — the app does not retype it.
    expect(columns[2]?.productLabel).toBe(' do ')
  })

  it('appends an old sheet’s own columns after the four, in printed order', () => {
    const columns = goodsColumns([paperColumn('RON 95', 5000), paperColumn('DO 0.05S', 8000)])
    expect(columns.map((c) => c.productLabel)).toEqual([
      'E0',
      'EA',
      'DO',
      'DC',
      'RON 95',
      'DO 0.05S',
    ])
    expect(columns[4]?.quantityLiters).toBe('5000')
  })

  it('appends a second column of the same fuel rather than overwriting the first', () => {
    const columns = goodsColumns([paperColumn('DO', 6000), paperColumn('DO', 3000)])
    expect(columns.map((c) => c.quantityLiters)).toEqual(['', '', '6000', '', '3000'])
  })
})

describe('a column that belongs in the saved biên bản', () => {
  it('drops a standard column nobody filled in — EA, on every biên bản so far', () => {
    expect(goodsColumnRecorded(emptyGoodsColumn('EA'))).toBe(false)
    expect(goodsColumnRecorded(emptyGoodsColumn('DC'))).toBe(false)
  })

  it('keeps a standard column carrying anything at all', () => {
    const e0 = emptyGoodsColumn('E0')
    expect(goodsColumnRecorded({ ...e0, quantityLiters: '6.000' })).toBe(true)
    expect(goodsColumnRecorded({ ...e0, warehouse: 'SG Petro' })).toBe(true)
    expect(goodsColumnRecorded({ ...e0, exportSlipNo: '0029151' })).toBe(true)
  })

  it('keeps a column the paper named that the app did not print, cells or no cells', () => {
    // The four headings are the app's own and it may drop them; "RON 95" is
    // something a reviewer read off an old sheet, and losing it is losing input.
    expect(goodsColumnRecorded(emptyGoodsColumn('RON 95'))).toBe(true)
    expect(goodsColumnRecorded(emptyGoodsColumn('DO 0.05S'))).toBe(true)
  })

  it('drops a column that names no product — there is nothing to book it under', () => {
    expect(goodsColumnRecorded(emptyGoodsColumn())).toBe(false)
    expect(goodsColumnRecorded({ ...emptyGoodsColumn('  '), warehouse: 'SG Petro' })).toBe(false)
  })
})

describe('the one seal the biên bản records', () => {
  it('takes the standard form’s merged cell', () => {
    expect(bienBanSeal({ sealNo: 'F821022 - F821019', products: [] })).toBe('F821022 - F821019')
  })

  it('falls back to an old sheet’s per-column seals, so the reviewer can still see them', () => {
    const seal = bienBanSeal({
      sealNo: null,
      products: [
        { ...paperColumn('RON 95', 5000), sealNo: 'F821022' },
        { ...paperColumn('DO 0.05S', 8000), sealNo: 'F821019' },
      ],
    })
    expect(seal).toBe('F821022, F821019')
  })

  it('says one seal once, however many columns the old sheet repeated it across', () => {
    const seal = bienBanSeal({
      sealNo: null,
      products: [
        { ...paperColumn('RON 95', 5000), sealNo: 'F821022' },
        { ...paperColumn('DO 0.05S', 8000), sealNo: 'F821022' },
      ],
    })
    expect(seal).toBe('F821022')
  })

  it('is empty when the paper carried no seal at all', () => {
    expect(bienBanSeal({ sealNo: null, products: [paperColumn('E0', 6000)] })).toBe('')
  })
})
