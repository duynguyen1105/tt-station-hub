import { describe, expect, it } from 'vitest'

import { FuelArea } from '@/lib/generated/prisma/client'
import { fuelAreaForProvince } from '@/lib/misa-export/province-fuel-area'

describe('fuelAreaForProvince', () => {
  it('maps highland/remote provinces to fuel area 2', () => {
    expect(fuelAreaForProvince('Đắk Nông')).toBe(FuelArea.FUEL_AREA_2)
    expect(fuelAreaForProvince('Lâm Đồng')).toBe(FuelArea.FUEL_AREA_2)
  })

  it('maps other provinces to fuel area 1', () => {
    expect(fuelAreaForProvince('Đồng Nai')).toBe(FuelArea.FUEL_AREA_1)
  })

  it('defaults unknown or null branch to fuel area 1', () => {
    expect(fuelAreaForProvince('Somewhere else')).toBe(FuelArea.FUEL_AREA_1)
    expect(fuelAreaForProvince(null)).toBe(FuelArea.FUEL_AREA_1)
  })
})
