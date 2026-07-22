import { describe, expect, it } from 'vitest'

import { normalizeStationLabel, pickStationByLabel } from '@/lib/matching/station-label'

const STATIONS = [
  { id: '1', code: 'DAKNONG_1', name: 'Đắk Nông 1' },
  { id: '2', code: 'DAKNONG_2', name: 'Đắk Nông 2' },
  { id: '6', code: 'LAMDONG_1', name: 'Lâm Đồng 1' },
  { id: '13', code: 'NGANHA_1', name: 'Ngân Hà 01' },
  { id: '8', code: 'NGUYEN_VUONG', name: 'Nguyên Vượng' },
]

describe('normalizeStationLabel', () => {
  it('strips diacritics (incl. Đ), spaces and punctuation', () => {
    expect(normalizeStationLabel('ĐAKNONG 1')).toBe('DAKNONG1')
    expect(normalizeStationLabel('Đắk Nông 1')).toBe('DAKNONG1')
    expect(normalizeStationLabel('LAMDONG 01')).toBe('LAMDONG01')
  })
})

describe('pickStationByLabel', () => {
  it('matches the printed label to the station code', () => {
    expect(pickStationByLabel('ĐAKNONG 1', STATIONS)?.code).toBe('DAKNONG_1')
    expect(pickStationByLabel('DAKNONG 2', STATIONS)?.code).toBe('DAKNONG_2')
  })

  it('matches zero-padded label variants', () => {
    expect(pickStationByLabel('LAMDONG 01', STATIONS)?.code).toBe('LAMDONG_1')
    expect(pickStationByLabel('NGANHA 01', STATIONS)?.code).toBe('NGANHA_1')
  })

  it('matches by station name and labels with extra words', () => {
    expect(pickStationByLabel('Nguyên Vượng', STATIONS)?.code).toBe('NGUYEN_VUONG')
    expect(pickStationByLabel('TRẠM ĐAKNONG 1', STATIONS)?.code).toBe('DAKNONG_1')
  })

  it('matches labels written without spaces (labeling standard v1.1)', () => {
    expect(pickStationByLabel('DAKNONG1', STATIONS)?.code).toBe('DAKNONG_1')
    expect(pickStationByLabel('NGUYENVUONG', STATIONS)?.code).toBe('NGUYEN_VUONG')
    expect(pickStationByLabel('LAMDONG1', STATIONS)?.code).toBe('LAMDONG_1')
    expect(pickStationByLabel('NGANHA1', STATIONS)?.code).toBe('NGANHA_1')
  })

  it('returns null for labels that match nothing', () => {
    expect(pickStationByLabel('PHUC TIEN', STATIONS)).toBeNull()
    expect(pickStationByLabel('', STATIONS)).toBeNull()
  })

  it('never confuses numbered siblings', () => {
    expect(pickStationByLabel('ĐAKNONG 1', STATIONS)?.code).not.toBe('DAKNONG_2')
  })
})
