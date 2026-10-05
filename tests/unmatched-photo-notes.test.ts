import { describe, expect, it } from 'vitest'

import { isVietnamese, unmatchedPhotoTrace } from '@/lib/photos/unmatched-photos'

describe('unmatched photo notes', () => {
  it('keeps Vietnamese notes', () => {
    expect(
      isVietnamese(
        'Màn hình LungBor hiện đủ 3 dòng: tiền, lít 1176.1400 và đơn giá. Nhãn ghi DAKNONG1 URE.'
      )
    ).toBe(true)
  })

  it('drops English notes even when they quote Vietnamese labels', () => {
    expect(
      isVietnamese(
        'LungBor LCD keypad panel on a blue panel showing all three rows filled. The label reads DAKNONG1 URE, TRỤ 1, HẦM 2. This matches the URE/debt_meter pattern.'
      )
    ).toBe(false)
  })

  it('treats empty notes as absent', () => {
    expect(isVietnamese('   ')).toBe(false)
  })

  it('surfaces only Vietnamese notes from the stored trace', () => {
    const vi = unmatchedPhotoTrace({
      router: { image_type: 'debt_meter', notes: 'Ảnh màn hình bán lẻ, chữ số cuối bị mờ.' },
    })
    expect(vi.notes).toBe('Ảnh màn hình bán lẻ, chữ số cuối bị mờ.')
    const en = unmatchedPhotoTrace({
      router: { image_type: 'debt_meter', notes: 'Green three-row screen, last digit blurry.' },
    })
    expect(en.notes).toBeNull()
  })
})
