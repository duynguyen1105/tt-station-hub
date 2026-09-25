import { describe, expect, it } from 'vitest'

import { stationTankOptions } from '@/lib/inventory/tank-options'

const fuelLabel = (fuelType: string) =>
  ({ XANG_E0: 'Xăng E0', DAU_DO: 'Dầu DO' })[fuelType] ?? fuelType

describe('stationTankOptions', () => {
  it('takes a hầm’s nhiên liệu and dung tích from Cấu hình over its old dip', () => {
    const options = stationTankOptions(
      {
        tanks: [{ code: 'HAM_1', fuelType: 'DAU_DO', capacityK: 25 }],
        dipTanks: [{ tankCode: 'HAM_1', fuelType: 'XANG_E0' }],
      },
      fuelLabel
    )
    expect(options).toEqual([
      { code: 'HAM_1', label: 'Hầm 1 — Dầu DO (25K)', fuelType: 'DAU_DO', capacityK: 25 },
    ])
  })

  it('lists a hầm created in Cấu hình before a trụ or dip names it', () => {
    const options = stationTankOptions(
      { tanks: [{ code: 'HAM_4', fuelType: 'XANG_E0', capacityK: 10 }], dipTanks: [] },
      fuelLabel
    )
    expect(options.map((o) => o.label)).toEqual(['Hầm 4 — Xăng E0 (10K)'])
  })

  it('preserves historical hầm named only by a dip without inventing capacity', () => {
    const options = stationTankOptions(
      {
        tanks: [],
        dipTanks: [
          { tankCode: 'HAM_3', fuelType: 'DAU_DO' },
          { tankCode: 'HAM_2', fuelType: null },
        ],
      },
      fuelLabel
    )
    expect(options).toEqual([
      { code: 'HAM_2', label: 'Hầm 2', fuelType: null, capacityK: null },
      { code: 'HAM_3', label: 'Hầm 3 — Dầu DO', fuelType: 'DAU_DO', capacityK: null },
    ])
  })
})
