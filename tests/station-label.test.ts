import { describe, expect, it } from 'vitest'

import { normalizeStationLabel, pickStationByLabel } from '@/lib/matching/station-label'

const STATIONS = [
  { id: '1', code: 'DAKNONG1', name: 'Đắk Nông 1' },
  { id: '2', code: 'DAKNONG2', name: 'Đắk Nông 2' },
  { id: '6', code: 'LAMDONG01', name: 'Lâm Đồng 1' },
  { id: '13', code: 'NGANHA01', name: 'Ngân Hà 01' },
  { id: '8', code: 'NGUYENVUONG', name: 'Nguyên Vượng' },
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
    expect(pickStationByLabel('ĐAKNONG 1', STATIONS)?.code).toBe('DAKNONG1')
    expect(pickStationByLabel('DAKNONG 2', STATIONS)?.code).toBe('DAKNONG2')
  })

  it('matches zero-padded label variants', () => {
    expect(pickStationByLabel('LAMDONG 01', STATIONS)?.code).toBe('LAMDONG01')
    expect(pickStationByLabel('NGANHA 01', STATIONS)?.code).toBe('NGANHA01')
  })

  it('matches by station name and labels with extra words', () => {
    expect(pickStationByLabel('Nguyên Vượng', STATIONS)?.code).toBe('NGUYENVUONG')
    expect(pickStationByLabel('TRẠM ĐAKNONG 1', STATIONS)?.code).toBe('DAKNONG1')
  })

  it('matches labels written without spaces (labeling standard v1.1)', () => {
    expect(pickStationByLabel('DAKNONG1', STATIONS)?.code).toBe('DAKNONG1')
    expect(pickStationByLabel('NGUYENVUONG', STATIONS)?.code).toBe('NGUYENVUONG')
    expect(pickStationByLabel('LAMDONG01', STATIONS)?.code).toBe('LAMDONG01')
    expect(pickStationByLabel('NGANHA01', STATIONS)?.code).toBe('NGANHA01')
  })

  it('returns null for labels that match nothing', () => {
    expect(pickStationByLabel('PHUC TIEN', STATIONS)).toBeNull()
    expect(pickStationByLabel('', STATIONS)).toBeNull()
  })

  it('never confuses numbered siblings', () => {
    expect(pickStationByLabel('ĐAKNONG 1', STATIONS)?.code).not.toBe('DAKNONG2')
  })
})
