import { describe, expect, it } from 'vitest'

import { Vung } from '@/lib/generated/prisma/client'
import { vungForProvince } from '@/lib/misa-export/station-mapping/province-vung'

describe('vungForProvince', () => {
  it('maps highland/remote provinces to Vùng 2', () => {
    expect(vungForProvince('Đắk Nông')).toBe(Vung.VUNG_2)
    expect(vungForProvince('Lâm Đồng')).toBe(Vung.VUNG_2)
  })

  it('maps other provinces to Vùng 1', () => {
    expect(vungForProvince('Đồng Nai')).toBe(Vung.VUNG_1)
  })

  it('defaults unknown or null branch to Vùng 1', () => {
    expect(vungForProvince('Somewhere else')).toBe(Vung.VUNG_1)
    expect(vungForProvince(null)).toBe(Vung.VUNG_1)
  })
})
